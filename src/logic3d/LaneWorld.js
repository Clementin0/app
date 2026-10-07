import { GAME3D, laneX } from '../config/game3d.config.js';
import { createRng } from '../logic/rng.js';
import { ScoreManager } from '../logic/ScoreManager.js';
import { LaneSpawner } from './LaneSpawner.js';

/** Default loadout: weapon and upgrade levels chosen in the shop. */
export const DEFAULT_LOADOUT = Object.freeze({
  weapon: 'blaster',
  damageLevel: 0,
  fireRateLevel: 0,
  magnetLevel: 0,
  hpLevel: 0,
  startShield: false,
});

const SOLID_OBSTACLES = new Set(['barrier', 'beam', 'wall', 'platform']);
const SHOOTABLE = new Set(['walker', 'drone', 'crate']);

function overlaps(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0 && a.z0 < b.z1 && a.z1 > b.z0;
}

export function entityBox(e) {
  return { x0: e.x - e.w / 2, x1: e.x + e.w / 2, y0: e.y, y1: e.y + e.h, z0: e.z - e.d / 2, z1: e.z + e.d / 2 };
}

/**
 * Framework-independent simulation of the 3D lane runner: three lanes,
 * jump / slide / lane switch, obstacles, shootable enemies with plasma
 * shots, a boss at the end of every zone, power-ups, combo scoring and a
 * rewarded revive. Rendering (Three.js) and HUD (Phaser) only read its state.
 */
export class LaneWorld {
  constructor({ rng, config = GAME3D, best = 0, loadout = {} } = {}) {
    this.cfg = config;
    this.rng = rng ?? createRng();
    this.loadout = { ...DEFAULT_LOADOUT, ...loadout };
    this.spawner = new LaneSpawner(this.rng, config);
    this.score = new ScoreManager({ scoring: { pointsPerMeter: 1, coinValue: config.SCORE.coin, gemValue: config.SCORE.gem }, pixelsPerMeter: 1, best });
    this.nextId = 1;
    this.reset();
  }

  // ------------------------------------------------------------- setup

  get weaponStats() {
    const base = this.cfg.WEAPONS_STATS[this.loadout.weapon] ?? this.cfg.WEAPONS_STATS.blaster;
    return {
      ...base,
      damage: base.damage * (1 + 0.35 * this.loadout.damageLevel),
      interval: base.interval * Math.pow(0.9, this.loadout.fireRateLevel),
    };
  }

  get maxHp() {
    return this.cfg.PLAYER.baseHp + this.loadout.hpLevel;
  }

  reset() {
    const { SPEED, POWERUPS } = this.cfg;
    this.time = 0;
    this.distance = 0;
    this.speed = SPEED.start;
    this.level = 0;
    this.state = 'running';
    this.deathCause = null;
    this.reviveUsed = false;
    this.events = [];
    this.entities = [];
    this.shots = [];
    this.eshots = [];
    this.boss = null;
    this.zone = { index: 0, start: 0, bossDone: false, cooldown: 0 };
    this.player = {
      lane: 1,
      x: laneX(1),
      y: 0,
      vy: 0,
      grounded: true,
      surface: 0,
      slide: 0,
      bufferJump: 0,
      bufferSlide: 0,
      hp: this.maxHp,
      invulnerable: 0,
      shield: this.loadout.startShield,
      magnet: 0,
      rapid: 0,
      double: 0,
      firing: false,
      queuedShots: 0,
      fireCooldown: 0,
    };
    this.combo = { count: 0, timer: 0, best: 0 };
    // Tutorial hooks: no random rows, and nothing can hurt the player.
    this.spawnPaused = false;
    this.safe = false;
    this.stats = { kills: 0, drones: 0, walkers: 0, crates: 0, bosses: 0, jumps: 0, slides: 0, shots: 0 };
    this.spawner.reset();
    // First rows appear ~50 m ahead, so the action starts within seconds.
    this.distanceToNext = 50 - this.cfg.WORLD.spawnZ;
    this.nextPowerupAt = this.rng.range(...POWERUPS.spawnEvery);
    this.score.reset();
  }

  _emit(type, data = {}) {
    // The event type always wins over data fields.
    this.events.push({ ...data, type });
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ------------------------------------------------------------- input

  get grounded() {
    return this.player.grounded;
  }

  moveLeft() {
    return this._changeLane(-1);
  }

  moveRight() {
    return this._changeLane(1);
  }

  _changeLane(dir) {
    if (this.state !== 'running') return false;
    const p = this.player;
    const target = p.lane + dir;
    if (target < 0 || target >= this.cfg.LANES.count) {
      this._emit('bump', { dir });
      return false;
    }
    // Do not slide sideways into the flank of a wall or platform.
    const tx = laneX(target);
    const blocked = this.entities.some(
      (e) =>
        !e.dead &&
        e.kind === 'obstacle' &&
        (e.type === 'wall' || e.type === 'platform') &&
        Math.abs(e.x - tx) < 0.1 &&
        e.z - e.d / 2 < 0.4 &&
        e.z + e.d / 2 > -0.4 &&
        p.y < e.y + e.h - this.cfg.WORLD.landTolerance,
    );
    if (blocked) {
      this._emit('bump', { dir });
      return false;
    }
    p.lane = target;
    this._emit('laneChange', { dir, lane: target });
    return true;
  }

  jump() {
    if (this.state !== 'running') return false;
    const p = this.player;
    if (p.grounded) return this._doJump();
    p.bufferJump = this.cfg.PLAYER.inputBuffer;
    return false;
  }

  _doJump() {
    const p = this.player;
    p.vy = this.cfg.PLAYER.jumpVelocity;
    p.grounded = false;
    p.slide = 0;
    p.bufferJump = 0;
    this.stats.jumps += 1;
    this._emit('jump', {});
    return true;
  }

  slide() {
    if (this.state !== 'running') return false;
    const p = this.player;
    if (!p.grounded) {
      // Slam down, then slide on landing.
      p.vy = Math.min(p.vy, this.cfg.PLAYER.slamVelocity);
      p.bufferSlide = this.cfg.PLAYER.inputBuffer + 0.3;
      this._emit('slam', {});
      return false;
    }
    return this._doSlide();
  }

  _doSlide() {
    const p = this.player;
    p.slide = this.cfg.PLAYER.slideTime;
    p.bufferSlide = 0;
    this.stats.slides += 1;
    this._emit('slide', {});
    return true;
  }

  /** Hold-to-fire. */
  setFiring(firing) {
    this.player.firing = !!firing;
  }

  /** Single tap: fire as soon as the weapon is ready. */
  fire() {
    if (this.state !== 'running') return;
    this.player.queuedShots = Math.min(2, this.player.queuedShots + 1);
  }

  // -------------------------------------------------------- simulation

  step(dt) {
    if (this.state !== 'running') return;
    const delta = Math.min(dt, this.cfg.WORLD.maxStep);
    if (!(delta > 0)) return;
    const { SPEED } = this.cfg;

    this.time += delta;
    const level = Math.min(8, Math.floor(this.time / 18) + this.zone.index * 2);
    if (level > this.level) {
      this.level = level;
      this._emit('levelUp', { level });
    }
    this.speed = SPEED.max - (SPEED.max - SPEED.start) * Math.exp(-this.time / SPEED.rampTime);
    const dz = this.speed * delta;
    this.distance += dz;
    this.score.addDistance(dz * (this.player.double > 0 ? 2 : 1));

    this._updateZone(delta);
    this._scrollAndSpawn(delta, dz);
    this._updatePlayer(delta);
    this._updateWeapon(delta);
    this._updateEnemies(delta);
    this._updateShots(delta);
    if (this.state === 'running') this._playerCollisions();
    if (this.state === 'running') this._updatePickups(delta);
    this._updateTimers(delta);
    this._cleanup();

    if (this.score.checkPassedBest()) this._emit('newBest', { score: this.score.score });
  }

  // ------------------------------------------------------- zones & boss

  /** Restarts random spawning ~50 m ahead (after the tutorial). */
  resumeSpawns() {
    this.spawnPaused = false;
    this.distanceToNext = 50 - this.cfg.WORLD.spawnZ;
    this.nextPowerupAt = this.time + this.rng.range(...this.cfg.POWERUPS.spawnEvery);
    this.zone.start = this.distance;
  }

  get zoneProgress() {
    return this.distance - this.zone.start;
  }

  _updateZone(dt) {
    const { ZONES } = this.cfg;
    if (this.zone.cooldown > 0) this.zone.cooldown = Math.max(0, this.zone.cooldown - dt);
    if (!this.boss && !this.zone.bossDone && this.zoneProgress >= ZONES.bossAt) {
      this._spawnBoss();
    }
  }

  _spawnBoss() {
    const { BOSS } = this.cfg;
    const zone = this.zone.index;
    const hp = BOSS.baseHp + BOSS.hpPerZone * zone;
    const kinds = this.cfg.BOSS_KINDS ?? GAME3D.BOSS_KINDS;
    const bossKind = kinds[zone % kinds.length];
    this.boss = {
      id: this.nextId++,
      kind: 'boss',
      type: 'boss',
      x: 0,
      y: BOSS.y,
      z: this.cfg.WORLD.spawnZ,
      w: BOSS.w,
      h: BOSS.h,
      d: 3,
      hp,
      maxHp: hp,
      dead: false,
      t: 0,
      bossKind: bossKind.id,
      patterns: bossKind.patterns,
      attackTimer: 2.5,
      attackIndex: 0,
      queue: [], // pending single shots: a lane, or null = aimed at the player
      queueGap: 0.28,
      queueTimer: 0,
      lifetime: 0,
      leaving: false,
    };
    this._emit('bossSpawn', { zone, hp, bossKind: bossKind.id });
  }

  _finishBoss(defeated) {
    const b = this.boss;
    if (!b) return;
    if (defeated) {
      this.stats.bosses += 1;
      const mult = this.player.double > 0 ? 2 : 1;
      this.score.addBonus(this.cfg.SCORE.kill.boss * (this.zone.index + 1) * mult);
      this.score.addCoin(40);
      this.score.addGem(3);
      this._emit('bossDefeated', { x: b.x, y: b.y + b.h / 2, z: b.z, coins: 40, gems: 3 });
    } else {
      this._emit('bossFled', {});
    }
    this.boss = null;
    this.zone = { index: this.zone.index + 1, start: this.distance, bossDone: false, cooldown: 2.5 };
    this._emit('zone', { index: this.zone.index });
  }

  _updateBoss(dt) {
    const b = this.boss;
    if (!b) return;
    const { BOSS, LANES } = this.cfg;
    b.t += dt;
    b.lifetime += dt;
    if (b.z > BOSS.z) b.z = Math.max(BOSS.z, b.z - this.speed * 0.6 * dt);
    b.x = Math.sin(b.t * 0.7) * LANES.width * 0.85;

    if (b.lifetime > BOSS.timeLimit && !b.leaving) {
      b.leaving = true;
      this._emit('bossLeaving', {});
    }
    if (b.leaving) {
      b.y += 6 * dt;
      b.z += 12 * dt;
      if (b.y > 12) this._finishBoss(false);
      return;
    }
    if (b.z > BOSS.z + 0.5) return;

    // Queued shots (bursts and sweeps) fire one after the other.
    if (b.queue.length) {
      b.queueTimer -= dt;
      if (b.queueTimer <= 0) {
        const lane = b.queue.shift();
        this._enemyShot(laneX(lane ?? this.player.lane), b.z - 1.5, 'boss');
        b.queueTimer = b.queueGap;
      }
      return;
    }
    b.attackTimer -= dt;
    if (b.attackTimer > 0) return;
    const pattern = b.patterns[b.attackIndex % b.patterns.length];
    b.attackIndex += 1;
    b.attackTimer = Math.max(0.8, BOSS.attackEvery - BOSS.attackSpeedup * this.zone.index);
    this._bossAttack(b, pattern);
  }

  _bossAttack(b, pattern) {
    const lanes = this.cfg.LANES.count;
    switch (pattern) {
      case 'burst':
        b.queue.push(null, null, null);
        b.queueGap = 0.28;
        b.queueTimer = 0;
        break;
      case 'sweep': {
        // Lane after lane: slide under it or slip behind it.
        const order = this.rng.chance(0.5) ? [0, 1, 2] : [2, 1, 0];
        b.queue.push(...order.slice(0, lanes));
        b.queueGap = 0.22;
        b.queueTimer = 0;
        this._emit('bossSweep', { x: b.x, z: b.z });
        break;
      }
      case 'mines': {
        // One or two lanes, never all of them.
        const count = this.rng.chance(0.5) ? 1 : 2;
        const free = this.rng.int(0, lanes - 1);
        const options = [];
        for (let lane = 0; lane < lanes; lane++) if (lane !== free) options.push(lane);
        const picked = count === 1 ? [this.rng.pick(options)] : options;
        for (const lane of picked) this._addEntity({ type: 'mine', lane, dz: 0 }, b.z - 2);
        this._emit('bossDrop', { x: b.x, y: b.y, z: b.z - 2, lanes: picked });
        break;
      }
      case 'drones':
        if (this._activeDrones() < 2) {
          const free = this.rng.int(0, lanes - 1);
          for (let lane = 0, n = 0; lane < lanes && n < 2; lane++) {
            if (lane === free) continue;
            this._addEntity({ type: 'drone', lane, dz: 0 }, b.z - 3);
            n += 1;
          }
          this._emit('bossSummon', { x: b.x, y: b.y, z: b.z });
          break;
        }
      // falls through: enough drones around, fire a volley instead
      default: {
        // Volley on all lanes but one.
        const free = this.rng.int(0, lanes - 1);
        for (let lane = 0; lane < lanes; lane++) if (lane !== free) this._enemyShot(laneX(lane), b.z - 1.5, 'boss');
      }
    }
  }

  // ---------------------------------------------------------- spawning

  _scrollAndSpawn(dt, dz) {
    const { POWERUPS, WORLD } = this.cfg;
    for (const e of this.entities) {
      if (e.type === 'drone' && e.state !== 'approach') continue; // drones keep pace
      e.z -= dz;
      if (e.type === 'walker') e.z -= this.cfg.ENEMIES.walker.walk * dt;
    }
    if (this.spawnPaused) return;

    const bossPhase = this.boss || (!this.zone.bossDone && this.zoneProgress >= this.cfg.ZONES.bossAt - 60);
    this.distanceToNext -= dz;
    while (this.distanceToNext <= 0) {
      const z0 = WORLD.spawnZ + this.distanceToNext;
      const pattern = bossPhase || this.zone.cooldown > 0 ? this.spawner.coinsOnly(this.speed) : this.spawner.next(this.level, this.speed, this._activeDrones());
      for (const item of pattern.items) this._addEntity(item, z0);

      if (!bossPhase && this.time >= this.nextPowerupAt) {
        const type = this._pickPowerup();
        this._addEntity({ type, lane: this.rng.int(0, 2), dz: pattern.length + pattern.gapAfter / 2, y: 0.5 }, z0);
        this.nextPowerupAt = this.time + this.rng.range(...POWERUPS.spawnEvery);
      }
      this.distanceToNext += pattern.length + pattern.gapAfter;
    }
  }

  _activeDrones() {
    return this.entities.filter((e) => e.type === 'drone' && !e.dead).length;
  }

  _pickPowerup() {
    const p = this.player;
    const pool = ['magnet', 'rapid', 'double'];
    if (!p.shield) pool.push('shield', 'shield');
    if (p.hp < this.maxHp) pool.push('heart', 'heart');
    return this.rng.pick(pool);
  }

  _addEntity(item, z0) {
    const { OBSTACLES, ENEMIES } = this.cfg;
    const x = laneX(item.lane);
    const z = z0 + item.dz;
    const base = { id: this.nextId++, type: item.type, lane: item.lane, x, z, dead: false };
    let e;
    switch (item.type) {
      case 'barrier':
      case 'wall': {
        const s = OBSTACLES[item.type];
        e = { ...base, kind: 'obstacle', y: 0, w: s.w, h: s.h, d: s.d };
        break;
      }
      case 'beam': {
        const s = OBSTACLES.beam;
        e = { ...base, kind: 'obstacle', y: s.y, w: s.w, h: s.h, d: s.d };
        break;
      }
      case 'platform': {
        const s = OBSTACLES.platform;
        const d = item.length ?? 14;
        e = { ...base, kind: 'obstacle', y: 0, w: s.w, h: s.h, d, z: z + d / 2 };
        break;
      }
      case 'crate':
      case 'mine':
      case 'walker': {
        const s = ENEMIES[item.type];
        const hp = s.hp + Math.floor(this.zone.index / 2);
        e = { ...base, kind: 'enemy', y: 0, w: s.w, h: s.h, d: s.d, hp, maxHp: hp, phase: this.rng.next() * 6 };
        break;
      }
      case 'drone': {
        const s = ENEMIES.drone;
        const hp = s.hp + Math.floor(this.zone.index / 2);
        e = {
          ...base,
          kind: 'enemy',
          y: s.y,
          w: s.w,
          h: s.h,
          d: s.d,
          hp,
          maxHp: hp,
          state: 'approach',
          holdZ: this.rng.range(...s.holdZ),
          stay: this.rng.range(...s.stay),
          fireTimer: this.rng.range(...s.fireEvery) * 0.6,
          hopTimer: this.rng.range(...s.hop),
          targetLane: item.lane,
          phase: this.rng.next() * 6,
        };
        break;
      }
      default: {
        // Pickups: coin, gem, shield, magnet, rapid, heart, double.
        const r = item.type === 'coin' ? 0.45 : 0.55;
        e = { ...base, kind: 'pickup', y: item.y ?? 0.5, w: r * 2, h: r * 2, d: r * 2 };
      }
    }
    this.entities.push(e);
    return e;
  }

  // ------------------------------------------------------------ player

  playerBox() {
    const p = this.player;
    const { PLAYER } = this.cfg;
    const h = p.slide > 0 ? PLAYER.slideHeight : PLAYER.height;
    return { x0: p.x - PLAYER.width / 2, x1: p.x + PLAYER.width / 2, y0: p.y, y1: p.y + h, z0: -PLAYER.depth / 2, z1: PLAYER.depth / 2 };
  }

  _updatePlayer(dt) {
    const p = this.player;
    const { PLAYER, LANES, WORLD } = this.cfg;

    // Lateral movement towards the target lane.
    const tx = laneX(p.lane);
    const maxStep = (LANES.width / PLAYER.laneSwitchTime) * dt;
    p.x += Math.max(-maxStep, Math.min(maxStep, tx - p.x));

    if (p.slide > 0) p.slide = Math.max(0, p.slide - dt);
    if (p.bufferJump > 0) p.bufferJump = Math.max(0, p.bufferJump - dt);
    if (p.bufferSlide > 0) p.bufferSlide = Math.max(0, p.bufferSlide - dt);

    // Vertical: gravity, ground and platform tops.
    const prevY = p.y;
    p.vy -= PLAYER.gravity * dt;
    p.y += p.vy * dt;

    let surface = 0;
    const box = this.playerBox();
    for (const e of this.entities) {
      if (e.dead || e.type !== 'platform') continue;
      const top = e.y + e.h;
      const b = entityBox(e);
      if (box.x0 < b.x1 && box.x1 > b.x0 && box.z0 < b.z1 && box.z1 > b.z0 && prevY >= top - WORLD.landTolerance) {
        surface = Math.max(surface, top);
      }
    }

    const wasGrounded = p.grounded;
    if (p.y <= surface) {
      const impact = p.vy;
      p.y = surface;
      p.vy = 0;
      p.grounded = true;
      if (!wasGrounded) {
        this._emit('land', { impact });
        if (p.bufferJump > 0) this._doJump();
        else if (p.bufferSlide > 0) this._doSlide();
      }
    } else if (p.y > surface + 0.01) {
      p.grounded = false;
    }
    p.surface = surface;
  }

  _updateWeapon(dt) {
    const p = this.player;
    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    if (p.fireCooldown > 0 || (!p.firing && p.queuedShots <= 0)) return;
    if (p.queuedShots > 0) p.queuedShots -= 1;

    const w = this.weaponStats;
    const rapid = p.rapid > 0;
    p.fireCooldown = w.interval * (rapid ? 0.55 : 1);
    const y = p.y + (p.slide > 0 ? 0.5 : this.cfg.BULLETS.height);
    const shot = (x, vx = 0) => this.shots.push({ id: this.nextId++, x, y, z: 0.6, vx, damage: w.damage, speed: w.speed, pierce: !!w.pierce, hits: new Set() });

    const pattern = rapid && w.pattern === 'single' ? 'spread' : w.pattern;
    if (pattern === 'twin') {
      shot(p.x - 0.3);
      shot(p.x + 0.3);
    } else if (pattern === 'spread') {
      shot(p.x);
      shot(p.x, -4.5);
      shot(p.x, 4.5);
    } else {
      shot(p.x);
    }
    this.stats.shots += 1;
    this._emit('shoot', { weapon: this.loadout.weapon, x: p.x, y });
  }

  // ----------------------------------------------------------- enemies

  _enemyShot(x, z, source) {
    const { BULLETS } = this.cfg;
    this.eshots.push({ id: this.nextId++, x, y: BULLETS.enemyHeight, z, r: BULLETS.enemyRadius, source });
    this._emit('enemyShot', { x, z, source });
  }

  _updateEnemies(dt) {
    const { ENEMIES, LANES } = this.cfg;
    const zoneBoost = 1 + this.zone.index * 0.15;
    for (const e of this.entities) {
      if (e.dead) continue;
      if (e.type === 'drone') {
        if (e.state === 'approach' && e.z <= e.holdZ) e.state = 'hold';
        if (e.state === 'hold') {
          e.stay -= dt;
          e.hopTimer -= dt;
          if (e.hopTimer <= 0) {
            e.targetLane = this.rng.int(0, LANES.count - 1);
            e.hopTimer = this.rng.range(...ENEMIES.drone.hop);
          }
          const tx = laneX(e.targetLane);
          e.x += Math.max(-6 * dt, Math.min(6 * dt, tx - e.x));
          e.fireTimer -= dt * zoneBoost;
          if (e.fireTimer <= 0 && Math.abs(e.x - tx) < 0.2) {
            this._enemyShot(e.x, e.z - 0.8, 'drone');
            e.fireTimer = this.rng.range(...ENEMIES.drone.fireEvery);
          }
          if (e.stay <= 0) e.state = 'leave';
        } else if (e.state === 'leave') {
          e.y += 5 * dt;
          e.z += 8 * dt;
          if (e.y > 9) e.dead = true;
        }
      }
    }
    this._updateBoss(dt);
  }

  // ------------------------------------------------------------- shots

  _updateShots(dt) {
    const { BULLETS } = this.cfg;
    for (const s of this.shots) {
      if (s.dead) continue;
      const prevZ = s.z;
      s.z += s.speed * dt;
      s.x += s.vx * dt;
      if (s.z > BULLETS.range) {
        s.dead = true;
        continue;
      }
      // Targets: enemies, the boss, enemy plasma, and solid obstacles that absorb shots.
      const n = this.entities.length;
      const boss = this.boss && !this.boss.leaving ? this.boss : null;
      for (let i = 0; i <= n; i++) {
        const e = i < n ? this.entities[i] : boss;
        if (!e || e.dead || s.dead || e.kind === 'pickup' || s.hits.has(e.id)) continue;
        if (e.type === 'barrier') continue; // shots fly over barriers
        const zMin = e.z - e.d / 2 - 0.3;
        const zMax = e.z + e.d / 2 + 0.3;
        if (s.z < zMin || prevZ > zMax) continue;
        if (Math.abs(s.x - e.x) > e.w / 2 + 0.2) continue;
        if (s.y < e.y - 0.45 || s.y > e.y + e.h + 0.45) continue;

        if (SOLID_OBSTACLES.has(e.type)) {
          s.dead = true;
          this._emit('shotBlocked', { x: s.x, y: s.y, z: Math.max(zMin, prevZ) });
          break;
        }
        s.hits.add(e.id);
        this._damageEnemy(e, s.damage);
        if (!s.pierce) s.dead = true;
      }
      if (s.dead) continue;
      for (const b of this.eshots) {
        if (b.dead) continue;
        if (Math.abs(b.x - s.x) < 0.6 && b.z >= prevZ - 0.5 && b.z <= s.z + 0.5) {
          b.dead = true;
          if (!s.pierce) s.dead = true;
          this._emit('plasmaDestroyed', { x: b.x, y: b.y, z: b.z });
          break;
        }
      }
    }

    for (const b of this.eshots) {
      if (b.dead) continue;
      b.z -= BULLETS.enemySpeed * dt;
      if (b.z < this.cfg.WORLD.despawnZ) b.dead = true;
    }
  }

  _damageEnemy(e, damage) {
    e.hp -= damage;
    this._emit('hit', { id: e.id, x: e.x, y: e.y + e.h / 2, z: e.z, enemy: e.type, boss: e.kind === 'boss' });
    if (e.hp > 0) return;
    if (e.kind === 'boss') {
      e.dead = true;
      this._finishBoss(true);
      return;
    }
    this._kill(e);
  }

  _kill(e, byPlayerShot = true) {
    e.dead = true;
    if (!byPlayerShot) return;
    const { SCORE } = this.cfg;
    const c = this.combo;
    c.count = c.timer > 0 ? Math.min(SCORE.comboMax, c.count + 1) : 1;
    c.timer = SCORE.comboWindow;
    c.best = Math.max(c.best, c.count);
    const mult = this.player.double > 0 ? 2 : 1;
    const points = (SCORE.kill[e.type] ?? 10) * c.count * mult;
    this.score.addBonus(points);
    this.stats.kills += e.type === 'crate' || e.type === 'mine' ? 0 : 1;
    if (e.type === 'drone') this.stats.drones += 1;
    if (e.type === 'walker') this.stats.walkers += 1;
    if (e.type === 'crate') this.stats.crates += 1;
    this._emit('kill', { id: e.id, enemy: e.type, x: e.x, y: e.y + e.h / 2, z: e.z, points, combo: c.count });
    if (c.count >= 2) this._emit('combo', { count: c.count });

    // Loot: a few coins (and sometimes a gem) pop out.
    const coins = e.type === 'drone' ? 3 : e.type === 'mine' ? 0 : 2;
    for (let i = 0; i < coins; i++) {
      this._addEntity({ type: 'coin', lane: e.lane ?? 1, dz: 1.2 + i * 1.6, y: 0.6 }, e.z).x = e.x;
    }
    if (e.type === 'drone' && this.rng.chance(0.2)) this._addEntity({ type: 'gem', lane: e.lane ?? 1, dz: 6, y: 0.7 }, e.z).x = e.x;
  }

  // -------------------------------------------------------- collisions

  _playerCollisions() {
    const p = this.player;
    const box = this.playerBox();
    const tol = this.cfg.WORLD.landTolerance;

    for (const e of this.entities) {
      if (e.dead || e.kind === 'pickup') continue;
      const b = entityBox(e);
      if (!overlaps(box, b)) continue;
      if (e.type === 'platform') {
        if (p.y < e.y + e.h - tol) this._crash(e);
      } else if (e.kind === 'obstacle') {
        this._crash(e);
      } else if (e.type === 'walker' || e.type === 'crate' || e.type === 'mine') {
        e.dead = true;
        this._emit('smash', { id: e.id, enemy: e.type, x: e.x, y: e.y + e.h / 2, z: e.z });
        this._damage(e.type);
      }
      if (this.state !== 'running') return;
    }

    for (const s of this.eshots) {
      if (s.dead) continue;
      const nx = Math.max(box.x0, Math.min(s.x, box.x1));
      const ny = Math.max(box.y0, Math.min(s.y, box.y1));
      const nz = Math.max(box.z0, Math.min(s.z, box.z1));
      if ((nx - s.x) ** 2 + (ny - s.y) ** 2 + (nz - s.z) ** 2 < s.r * s.r) {
        s.dead = true;
        this._damage('plasma');
        if (this.state !== 'running') return;
      }
    }
  }

  /** Hitting an obstacle: lethal unless shielded or invulnerable. */
  _crash(e) {
    const p = this.player;
    if (p.invulnerable > 0 || this.safe) return;
    if (p.shield) {
      p.shield = false;
      p.invulnerable = this.cfg.POWERUPS.shieldGrace;
      e.dead = true;
      this._emit('shieldBreak', { x: e.x, y: 1, z: e.z });
      return;
    }
    this._die(e.type);
  }

  /** Enemy contact or plasma: costs one heart. */
  _damage(cause) {
    const p = this.player;
    if (p.invulnerable > 0 || this.safe) return;
    if (p.shield) {
      p.shield = false;
      p.invulnerable = this.cfg.POWERUPS.shieldGrace;
      this._emit('shieldBreak', { x: p.x, y: 1, z: 0 });
      return;
    }
    p.hp -= 1;
    p.invulnerable = this.cfg.PLAYER.hitGrace;
    this.combo.count = 0;
    this.combo.timer = 0;
    this._emit('hurt', { hp: p.hp, cause });
    if (p.hp <= 0) this._die(cause);
  }

  _die(cause) {
    if (this.state !== 'running') return;
    this.state = 'dead';
    this.deathCause = cause;
    this.player.firing = false;
    this._emit('death', { cause, x: this.player.x, y: this.player.y });
  }

  // ----------------------------------------------------------- pickups

  _updatePickups(dt) {
    const p = this.player;
    const { POWERUPS } = this.cfg;
    const box = this.playerBox();
    const grab = { x0: box.x0 - 0.35, x1: box.x1 + 0.35, y0: box.y0 - 0.3, y1: box.y1 + 0.3, z0: box.z0 - 0.4, z1: box.z1 + 0.4 };
    const cx = p.x;
    const cy = p.y + 0.9;

    for (const e of this.entities) {
      if (e.dead || e.kind !== 'pickup') continue;
      if (p.magnet > 0 && (e.type === 'coin' || e.type === 'gem')) {
        const dx = cx - e.x;
        const dy = cy - e.y;
        const dzz = -e.z;
        const dist = Math.hypot(dx, dy, dzz);
        if (e.attracted || dist < POWERUPS.magnetRadius) {
          e.attracted = true;
          const stepLen = Math.min(dist, (30 + this.speed) * dt);
          if (dist > 0) {
            e.x += (dx / dist) * stepLen;
            e.y += (dy / dist) * stepLen;
            e.z += (dzz / dist) * stepLen + this.speed * dt; // cancel the scroll while flying in
          }
        }
      }
      if (!overlaps(grab, entityBox(e))) continue;
      e.dead = true;
      this._collect(e);
    }
  }

  _collect(e) {
    const p = this.player;
    const { POWERUPS } = this.cfg;
    const mult = p.double > 0 ? 2 : 1;
    switch (e.type) {
      case 'coin':
        this.score.addCoin(1);
        if (mult > 1) this.score.addBonus(this.cfg.SCORE.coin);
        break;
      case 'gem':
        this.score.addGem(1);
        if (mult > 1) this.score.addBonus(this.cfg.SCORE.gem);
        break;
      case 'shield':
        p.shield = true;
        break;
      case 'magnet':
        p.magnet = POWERUPS.magnet + this.loadout.magnetLevel * 2;
        break;
      case 'rapid':
        p.rapid = POWERUPS.rapid;
        break;
      case 'double':
        p.double = POWERUPS.double;
        break;
      case 'heart':
        if (p.hp < this.maxHp) p.hp += 1;
        else this.score.addBonus(100);
        break;
      default:
        break;
    }
    this._emit(e.type === 'coin' || e.type === 'gem' ? e.type : 'powerup', { kind: e.type, x: e.x, y: e.y, z: e.z });
  }

  _updateTimers(dt) {
    const p = this.player;
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    for (const k of ['magnet', 'rapid', 'double']) {
      if (p[k] > 0) {
        p[k] = Math.max(0, p[k] - dt);
        if (p[k] === 0) this._emit('powerupEnd', { kind: k });
      }
    }
    if (this.combo.timer > 0) {
      this.combo.timer = Math.max(0, this.combo.timer - dt);
      if (this.combo.timer === 0) this.combo.count = 0;
    }
  }

  _cleanup() {
    const { WORLD } = this.cfg;
    this.entities = this.entities.filter((e) => !e.dead && e.z + e.d / 2 > WORLD.despawnZ);
    this.shots = this.shots.filter((s) => !s.dead);
    this.eshots = this.eshots.filter((s) => !s.dead);
  }

  // ------------------------------------------------------------ revive

  get canRevive() {
    return this.state === 'dead' && !this.reviveUsed;
  }

  /** Second chance (rewarded ad): full health, nearby threats cleared, short invulnerability. */
  revive() {
    if (!this.canRevive) return false;
    const p = this.player;
    this.reviveUsed = true;
    this.entities = this.entities.filter((e) => e.kind === 'pickup' || e.z > 45);
    this.eshots = [];
    this.shots = [];
    p.hp = this.maxHp;
    p.y = 0;
    p.vy = 0;
    p.grounded = true;
    p.slide = 0;
    p.invulnerable = this.cfg.POWERUPS.reviveGrace;
    if (this.boss) this.boss.attackTimer = 3;
    this.state = 'running';
    this.deathCause = null;
    this._emit('revive', {});
    return true;
  }

  // -------------------------------------------------------------- HUD

  hud() {
    const p = this.player;
    const b = this.boss;
    return {
      score: this.score.score,
      best: Math.max(this.score.best, this.score.score),
      coins: this.score.coins,
      gems: this.score.gems,
      meters: Math.floor(this.distance),
      hp: p.hp,
      maxHp: this.maxHp,
      shield: p.shield,
      magnet: p.magnet,
      rapid: p.rapid,
      double: p.double,
      combo: this.combo.count,
      comboTimer: this.combo.timer,
      zone: this.zone.index,
      zoneProgress: Math.min(1, this.zoneProgress / this.cfg.ZONES.bossAt),
      boss: b ? { hp: Math.max(0, b.hp), maxHp: b.maxHp, leaving: b.leaving, kind: b.bossKind } : null,
      fireReady: p.fireCooldown <= 0,
    };
  }
}
