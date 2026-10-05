import { GAME_CONFIG } from '../config/game.config.js';
import { circleRectOverlap, rectsOverlap, spansOverlap } from './collision.js';
import { levelAt, speedAt } from './Difficulty.js';
import { createRng } from './rng.js';
import { ScoreManager } from './ScoreManager.js';
import { SIZES, Spawner } from './Spawner.js';

export const HAZARDS = new Set(['spike', 'saw']);
export const SOLIDS = new Set(['block']);
export const PICKUPS = new Set(['coin', 'gem', 'shield', 'magnet']);

/** Player x position for a given screen width. */
export function playerXFor(width, player = GAME_CONFIG.PLAYER) {
  return Math.round(Math.min(player.maxX, Math.max(player.minX, width * player.xRatio)));
}

/**
 * Framework-independent simulation of a run: scrolling, spawning, physics,
 * collisions, pickups, score and revive. Phaser only renders its state, so
 * the whole game logic is unit-testable in Node.
 *
 * Coordinates are screen pixels. Entities use center x/y; the player uses
 * x = center and y = feet. Rendering-relevant changes are reported through
 * events (see drainEvents()).
 */
export class RunnerWorld {
  constructor({ width, height, rng, config = GAME_CONFIG, best = 0 } = {}) {
    this.cfg = config;
    this.rng = rng ?? createRng();
    this.spawner = new Spawner(this.rng, config);
    this.score = new ScoreManager({ scoring: config.SCORING, pixelsPerMeter: config.WORLD.pixelsPerMeter, best });
    this.width = width;
    this.height = height;
    // Ids stay unique across resets so renderers can diff entities safely.
    this.nextId = 1;
    this.reset();
  }

  reset() {
    const { WORLD, SPEED, POWERUPS } = this.cfg;
    this.time = 0;
    this.level = 0;
    this.speed = speedAt(0, SPEED);
    this.state = 'running';
    this.deathCause = null;
    this.reviveUsed = false;
    this.events = [];
    this.entities = [];
    this.groundY = this.height - WORLD.groundOffset;
    this.segments = [{ id: this.nextId++, x: -WORLD.groundTile * 2, w: this.width + 4000 }];
    this.player = {
      x: playerXFor(this.width, this.cfg.PLAYER),
      y: this.groundY,
      vy: 0,
      grounded: true,
      jumpsUsed: 0,
      coyote: 0,
      buffer: 0,
      jumpTime: 0,
      cutPending: false,
      invulnerable: 0,
      shield: false,
      magnet: 0,
    };
    this.spawner.reset();
    this.distanceToNext = this.speed * 1.6;
    this.nextPowerupAt = this.rng.range(...POWERUPS.spawnEvery);
    this.score.reset();
  }

  // ---------------------------------------------------------------- input

  pressJump() {
    if (this.state !== 'running') return false;
    const p = this.player;
    if (p.grounded || p.coyote > 0) return this._jump(false);
    if (p.jumpsUsed < this.cfg.PHYSICS.maxJumps) return this._jump(true);
    p.buffer = this.cfg.PHYSICS.jumpBuffer;
    return false;
  }

  releaseJump() {
    const p = this.player;
    if (p.vy < 0) p.cutPending = true;
  }

  _jump(isDouble) {
    const p = this.player;
    const P = this.cfg.PHYSICS;
    p.vy = -(isDouble ? P.doubleJumpVelocity : P.jumpVelocity);
    p.grounded = false;
    p.coyote = 0;
    p.buffer = 0;
    p.jumpTime = 0;
    p.cutPending = false;
    p.jumpsUsed = isDouble ? P.maxJumps : 1;
    this._emit(isDouble ? 'doubleJump' : 'jump', { x: p.x, y: p.y });
    return true;
  }

  // ----------------------------------------------------------- simulation

  step(dt) {
    if (this.state !== 'running') return;
    const { WORLD, SPEED } = this.cfg;
    const delta = Math.min(dt, WORLD.maxStep);
    if (!(delta > 0)) return;

    this.time += delta;
    const level = levelAt(this.time, SPEED);
    if (level > this.level) {
      this.level = level;
      this._emit('levelUp', { level });
    }
    this.speed = speedAt(this.time, SPEED);

    const dx = this.speed * delta;
    this.score.addDistance(dx);
    for (const e of this.entities) e.x -= dx;
    for (const s of this.segments) s.x -= dx;
    this._maintainGround();

    this.distanceToNext -= dx;
    while (this.distanceToNext <= 0) this._spawnPattern();

    this._updatePlayer(delta);
    if (this.state === 'running') this._checkHazards();
    if (this.state === 'running') this._updatePickups(delta);
    this._cleanup();

    if (this.score.checkPassedBest()) this._emit('newBest', { score: this.score.score });
  }

  _updatePlayer(dt) {
    const p = this.player;
    const P = this.cfg.PHYSICS;
    const W = this.cfg.WORLD;

    p.invulnerable = Math.max(0, p.invulnerable - dt);
    if (p.magnet > 0) {
      p.magnet = Math.max(0, p.magnet - dt);
      if (p.magnet === 0) this._emit('magnetEnd', {});
    }
    if (p.buffer > 0) p.buffer = Math.max(0, p.buffer - dt);
    if (p.coyote > 0) {
      p.coyote = Math.max(0, p.coyote - dt);
      if (p.coyote === 0 && !p.grounded && p.jumpsUsed === 0) p.jumpsUsed = 1;
    }

    // Variable jump height: an early release cuts the jump, but only after a
    // minimum hold so that quick taps still produce a useful jump.
    p.jumpTime += dt;
    if (p.cutPending && p.jumpTime >= 0.12) {
      if (p.vy < 0) p.vy *= P.jumpCutFactor;
      p.cutPending = false;
    }

    const prevBottom = p.y;
    const impact = p.vy;
    p.vy = Math.min(p.vy + P.gravity * dt, P.maxFallSpeed);
    p.y += p.vy * dt;

    const box = this.playerBox();
    let landed = false;

    if (p.vy >= 0) {
      for (const e of this.entities) {
        if (!SOLIDS.has(e.type) || e.dead) continue;
        const top = e.y - e.h / 2;
        if (spansOverlap(box.x, box.x + box.w, e.x - e.w / 2, e.x + e.w / 2) && prevBottom <= top + W.landTolerance && p.y >= top) {
          p.y = top;
          landed = true;
        }
      }
      if (!landed && prevBottom <= this.groundY + W.landTolerance && p.y >= this.groundY && this.hasGroundUnder(box)) {
        p.y = this.groundY;
        landed = true;
      }
    }

    if (landed) {
      if (!p.grounded) this._emit('land', { x: p.x, y: p.y, impact: Math.max(impact, p.vy) });
      p.vy = 0;
      p.grounded = true;
      p.jumpsUsed = 0;
      p.coyote = 0;
      p.cutPending = false;
      if (p.buffer > 0) this._jump(false);
    } else if (p.grounded) {
      // Walked off an edge.
      p.grounded = false;
      p.coyote = P.coyoteTime;
    }
  }

  _checkHazards() {
    const p = this.player;
    const W = this.cfg.WORLD;
    const box = this.playerBox();

    for (const e of this.entities) {
      if (e.dead) continue;
      if (e.type === 'block') {
        const rect = { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h };
        if (p.y > rect.y + W.landTolerance && rectsOverlap(box, rect)) this._hit(e);
      } else if (e.type === 'spike') {
        // Forgiving hitbox inside the triangle.
        const hw = e.w * 0.28;
        const hh = e.h * 0.72;
        const rect = { x: e.x - hw, y: e.y + e.h / 2 - hh, w: hw * 2, h: hh };
        if (rectsOverlap(box, rect)) this._hit(e);
      } else if (e.type === 'saw') {
        if (circleRectOverlap(e.x, e.y, e.r * 0.82, box)) this._hit(e);
      }
      if (this.state !== 'running') return;
    }

    // Inside a pit: hitting the next ground edge or falling too deep.
    if (p.y > this.groundY + W.landTolerance && this.hasGroundUnder(box)) {
      this._die('fall');
    } else if (p.y > this.groundY + W.fallDeathDepth) {
      this._die('fall');
    }
  }

  _hit(entity) {
    const p = this.player;
    if (p.invulnerable > 0) return;
    if (p.shield) {
      p.shield = false;
      p.invulnerable = this.cfg.POWERUPS.shieldGrace;
      entity.dead = true;
      this._emit('shieldBreak', { x: entity.x, y: entity.y, entityId: entity.id });
      return;
    }
    this._die(entity.type);
  }

  _die(cause) {
    if (this.state !== 'running') return;
    this.state = 'dead';
    this.deathCause = cause;
    this.player.vy = 0;
    this._emit('death', { cause, x: this.player.x, y: this.player.y });
  }

  _updatePickups(dt) {
    const p = this.player;
    const PU = this.cfg.POWERUPS;
    const box = this.playerBox();
    const pcx = p.x;
    const pcy = p.y - box.h / 2;
    const grab = { x: box.x - 6, y: box.y - 6, w: box.w + 12, h: box.h + 12 };

    for (const e of this.entities) {
      if (e.dead || !PICKUPS.has(e.type)) continue;

      if (p.magnet > 0 && (e.type === 'coin' || e.type === 'gem')) {
        const dx = pcx - e.x;
        const dy = pcy - e.y;
        const dist = Math.hypot(dx, dy);
        if (e.attracted || dist < PU.magnetRadius) {
          e.attracted = true;
          const stepLen = Math.min(dist, PU.magnetPull * dt + this.speed * dt);
          if (dist > 0) {
            e.x += (dx / dist) * stepLen;
            e.y += (dy / dist) * stepLen;
          }
        }
      }

      if (!circleRectOverlap(e.x, e.y, e.r, grab)) continue;
      e.dead = true;
      if (e.type === 'coin') this.score.addCoin();
      else if (e.type === 'gem') this.score.addGem();
      else if (e.type === 'shield') p.shield = true;
      else if (e.type === 'magnet') p.magnet = PU.magnetDuration;
      this._emit(e.type, { x: e.x, y: e.y, entityId: e.id });
    }
  }

  // ------------------------------------------------------------- spawning

  _spawnPattern() {
    const { WORLD, POWERUPS } = this.cfg;
    const spawnX = this.width + WORLD.spawnMargin + this.distanceToNext;
    const pattern = this.spawner.next(this.level, this.speed);

    for (const item of pattern.items) {
      if (item.type === 'gap') this._cutGround(spawnX + item.dx, item.w);
      else this._addEntity(item, spawnX);
    }

    // Power-ups float over the safe ground that follows a pattern.
    if (this.time >= this.nextPowerupAt) {
      const type = this.player.shield || this.rng.chance(0.5) ? 'magnet' : 'shield';
      this._addEntity({ type, dx: pattern.width + pattern.gapAfter / 2, dy: 58 }, spawnX);
      this.nextPowerupAt = this.time + this.rng.range(...POWERUPS.spawnEvery);
    }

    this.lastPattern = pattern.key;
    this.distanceToNext += pattern.width + pattern.gapAfter;
  }

  _addEntity(item, originX) {
    const e = { id: this.nextId++, type: item.type, x: originX + item.dx, y: 0, w: 0, h: 0, r: 0, dead: false };
    if (item.type === 'spike' || item.type === 'block') {
      e.w = item.w;
      e.h = item.h;
      e.y = this.groundY - item.h / 2;
    } else {
      const r = item.r ?? (item.type === 'coin' ? SIZES.coin.r : item.type === 'gem' ? SIZES.gem.r : SIZES.powerup.r);
      e.r = r;
      e.w = e.h = r * 2;
      e.y = this.groundY - item.dy;
    }
    this.entities.push(e);
    return e;
  }

  _cutGround(gapX, gapW) {
    const last = this.segments[this.segments.length - 1];
    if (gapX <= last.x) return;
    last.w = gapX - last.x;
    this.segments.push({ id: this.nextId++, x: gapX + gapW, w: this.width + 4000 });
  }

  _maintainGround() {
    const { WORLD } = this.cfg;
    const last = this.segments[this.segments.length - 1];
    const needed = this.width + 2000 - last.x;
    if (last.w < needed) last.w = needed;

    // Trim far-left parts in whole tiles, so the texture pattern stays continuous.
    const limit = -WORLD.despawnMargin;
    for (const s of this.segments) {
      if (s.x < limit - WORLD.groundTile) {
        const cut = Math.floor((limit - s.x) / WORLD.groundTile) * WORLD.groundTile;
        if (cut > 0 && cut < s.w) {
          s.x += cut;
          s.w -= cut;
        }
      }
    }
  }

  _cleanup() {
    const limit = -this.cfg.WORLD.despawnMargin;
    this.entities = this.entities.filter((e) => !e.dead && e.x + e.w / 2 > limit);
    if (this.segments.length > 1) {
      this.segments = this.segments.filter((s, i) => i === this.segments.length - 1 || s.x + s.w > limit);
    }
  }

  // --------------------------------------------------------------- revive

  get canRevive() {
    return this.state === 'dead' && !this.reviveUsed;
  }

  /** Second chance (rewarded ad): clears nearby hazards and restores the ground. Once per run. */
  revive() {
    if (!this.canRevive) return false;
    const { REVIVE, POWERUPS } = this.cfg;
    const p = this.player;
    this.reviveUsed = true;

    const minX = p.x - REVIVE.clearBehind;
    const maxX = p.x + REVIVE.clearAhead;
    this.entities = this.entities.filter((e) => {
      if (!HAZARDS.has(e.type) && !SOLIDS.has(e.type)) return true;
      return !(e.x + e.w / 2 > minX && e.x - e.w / 2 < maxX);
    });
    this._fillGround(minX, maxX);

    p.y = this.groundY;
    p.vy = 0;
    p.grounded = true;
    p.jumpsUsed = 0;
    p.coyote = 0;
    p.buffer = 0;
    p.cutPending = false;
    p.invulnerable = POWERUPS.reviveGrace;

    this.state = 'running';
    this.deathCause = null;
    this._emit('revive', { x: p.x, y: p.y });
    return true;
  }

  _fillGround(minX, maxX) {
    const all = [...this.segments, { id: this.nextId++, x: minX, w: maxX - minX }].sort((a, b) => a.x - b.x);
    const merged = [];
    for (const s of all) {
      const prev = merged[merged.length - 1];
      if (prev && s.x <= prev.x + prev.w) {
        prev.w = Math.max(prev.x + prev.w, s.x + s.w) - prev.x;
      } else {
        merged.push({ ...s });
      }
    }
    this.segments = merged;
  }

  // -------------------------------------------------------------- queries

  playerBox() {
    const p = this.player;
    const { hitboxWidth: w, hitboxHeight: h } = this.cfg.PLAYER;
    return { x: p.x - w / 2, y: p.y - h, w, h };
  }

  hasGroundUnder(box) {
    const inset = this.cfg.WORLD.edgeForgiveness;
    return this.segments.some((s) => spansOverlap(box.x + inset, box.x + box.w - inset, s.x, s.x + s.w));
  }

  /** Called when the viewport changes: keeps everything anchored to the ground line. */
  setViewport(width, height) {
    const groundY = height - this.cfg.WORLD.groundOffset;
    const d = groundY - this.groundY;
    if (d !== 0) {
      for (const e of this.entities) e.y += d;
      this.player.y += d;
      this.groundY = groundY;
    }
    this.width = width;
    this.height = height;
    this.player.x = playerXFor(width, this.cfg.PLAYER);
  }

  hud() {
    const p = this.player;
    return {
      score: this.score.score,
      best: Math.max(this.score.best, this.score.score),
      coins: this.score.coins,
      gems: this.score.gems,
      meters: this.score.meters,
      level: this.level,
      speed: this.speed,
      shield: p.shield,
      magnet: p.magnet,
      magnetRatio: p.magnet / this.cfg.POWERUPS.magnetDuration,
    };
  }

  _emit(type, data) {
    this.events.push({ type, ...data });
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }
}
