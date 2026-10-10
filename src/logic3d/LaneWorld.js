import { GAME3D, laneX } from '../config/game3d.config.js';
import { getPerk, PERK_TUNING, PERKS } from '../config/perks.js';
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
// Shots fly over these (low obstacles, holes, meteor markers).
const SHOTS_PASS = new Set(['barrier', 'slider', 'gap', 'meteor']);
// Enemies that hurt on contact (and break).
const CONTACT_ENEMIES = new Set(['walker', 'crate', 'mine', 'charger', 'turret']);

/**
 * Optional rules of a run (daily challenge, boss rush): speed and score
 * multipliers, fixed hearts or weapon, forced events, bosses sooner.
 */
export const DEFAULT_MODIFIERS = Object.freeze({ speed: 1, score: 1, hp: null, weapon: null, event: null, bossAt: null });

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
  constructor({ rng, config = GAME3D, best = 0, loadout = {}, mode = 'endless', modifiers = {}, courseSeed = null } = {}) {
    this.cfg = config;
    this.rng = rng ?? createRng();
    // The course (rows, power-ups, events) can have its own seed, so the
    // daily challenge stays the same whatever the player shoots.
    this.courseRng = courseSeed === null ? this.rng : createRng(courseSeed);
    this.mode = mode; // 'endless' | 'daily' | 'bossRush'
    this.modifiers = { ...DEFAULT_MODIFIERS, ...modifiers };
    this.loadout = { ...DEFAULT_LOADOUT, ...loadout };
    if (this.modifiers.weapon) this.loadout.weapon = this.modifiers.weapon;
    this.spawner = new LaneSpawner(this.courseRng, config);
    this.score = new ScoreManager({ scoring: { pointsPerMeter: 1, coinValue: config.SCORE.coin, gemValue: config.SCORE.gem }, pixelsPerMeter: 1, best });
    this.nextId = 1;
    this.reset();
  }

  // ------------------------------------------------------------- setup

  get weaponStats() {
    const base = this.cfg.WEAPONS_STATS[this.loadout.weapon] ?? this.cfg.WEAPONS_STATS.blaster;
    const perk = (id) => this.perks?.[id] ?? 0;
    return {
      ...base,
      damage: base.damage * (1 + 0.35 * this.loadout.damageLevel) * (1 + PERK_TUNING.damagePerLevel * perk('damage')),
      interval: base.interval * Math.pow(0.9, this.loadout.fireRateLevel) * Math.pow(PERK_TUNING.fireRatePerLevel, perk('fireRate')),
      pierce: !!base.pierce || perk('pierce') > 0,
      multishot: perk('multishot') > 0,
    };
  }

  get maxHp() {
    if (this.modifiers.hp) return this.modifiers.hp + (this.perks?.heart ?? 0);
    return this.cfg.PLAYER.baseHp + this.loadout.hpLevel + (this.perks?.heart ?? 0);
  }

  perkLevel(id) {
    return this.perks[id] ?? 0;
  }

  /** Meters into the zone when the boss shows up. */
  get bossAt() {
    if (this.mode === 'bossRush') return this.zone.index === 0 ? 40 : 70;
    return this.modifiers.bossAt ?? this.cfg.ZONES.bossAt;
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
    this.zone = { index: 0, start: 0, bossDone: false, cooldown: 0, eventsDone: 0 };
    this.perks = {};
    this.perkOffer = null; // 3 perk ids to choose from, after a boss
    this.event = null; // run event in progress (gold rush, ambush, meteors)
    this.lastEvent = null;
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
      jetpack: 0, // seconds of flight left
      shieldRegen: 0, // seconds until a lost shield comes back (perk)
    };
    this.combo = { count: 0, timer: 0, best: 0 };
    // Tutorial hooks: no random rows, and nothing can hurt the player.
    this.spawnPaused = false;
    this.safe = false;
    this.stats = { kills: 0, drones: 0, walkers: 0, crates: 0, chargers: 0, turrets: 0, bombers: 0, bosses: 0, jumps: 0, slides: 0, shots: 0, events: 0, perks: 0, killsSinceHeal: 0 };
    this.spawner.reset();
    // First rows appear ~50 m ahead, so the action starts within seconds.
    this.distanceToNext = 50 - this.cfg.WORLD.spawnZ;
    this.nextPowerupAt = this.courseRng.range(...POWERUPS.spawnEvery);
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
    if (this.state !== 'running' || this.player.jetpack > 0) return false;
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
    if (this.state !== 'running' || this.player.jetpack > 0) return false;
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
    this.speed = this._speedAt(this.time);
    const dz = this.speed * delta;
    this.distance += dz;
    this.score.addDistance(dz * (this.player.double > 0 ? 2 : 1) * this.modifiers.score);

    this._updateZone(delta);
    this._updateEvent(delta);
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

  /** Running speed: ramp, slowed by the "slowmo" perk, scaled by events and modifiers. */
  _speedAt(time) {
    const { SPEED } = this.cfg;
    const top = SPEED.max * (this.perks.slowmo ? PERK_TUNING.slowmo : 1);
    const base = top - (top - SPEED.start) * Math.exp(-time / SPEED.rampTime);
    const event = this.event ? (this.cfg.EVENTS[this.event.type]?.speed ?? 1) : 1;
    return base * event * this.modifiers.speed;
  }

  // ------------------------------------------------------------- perks

  /** Up to `n` distinct perks that are not maxed yet. */
  rollPerks(n = 3) {
    const pool = PERKS.filter((p) => this.perkLevel(p.id) < p.max).map((p) => p.id);
    const out = [];
    while (out.length < n && pool.length) out.push(pool.splice(this.rng.int(0, pool.length - 1), 1)[0]);
    return out;
  }

  choosePerk(id) {
    if (!this.perkOffer || !this.perkOffer.includes(id)) return false;
    const perk = getPerk(id);
    this.perks[id] = Math.min(perk.max, this.perkLevel(id) + 1);
    this.perkOffer = null;
    this.stats.perks += 1;
    if (id === 'heart') this.player.hp = Math.min(this.maxHp, this.player.hp + 1);
    this._emit('perk', { id, level: this.perks[id] });
    return true;
  }

  // ------------------------------------------------------- zones & boss

  /** Restarts random spawning ~50 m ahead (after the tutorial). */
  resumeSpawns() {
    this.spawnPaused = false;
    this.distanceToNext = 50 - this.cfg.WORLD.spawnZ;
    this.nextPowerupAt = this.time + this.courseRng.range(...this.cfg.POWERUPS.spawnEvery);
    this.zone.start = this.distance;
  }

  get zoneProgress() {
    return this.distance - this.zone.start;
  }

  _updateZone(dt) {
    const { ZONES } = this.cfg;
    if (this.zone.cooldown > 0) this.zone.cooldown = Math.max(0, this.zone.cooldown - dt);
    if (!this.boss && !this.zone.bossDone && !this.event && this.zoneProgress >= this.bossAt) {
      this._spawnBoss();
      return;
    }
    // Run events at fixed points of the zone (not in boss rush).
    const next = ZONES.eventsAt?.[this.zone.eventsDone];
    if (this.mode !== 'bossRush' && !this.spawnPaused && !this.boss && !this.event && next !== undefined && this.zoneProgress >= next && this.zoneProgress < this.bossAt - 150) {
      this.zone.eventsDone += 1;
      const type = this._pickEvent();
      if (type) this._startEvent(type);
    }
  }

  // ------------------------------------------------------- run events

  _pickEvent() {
    if (this.modifiers.event) return this.modifiers.event;
    const options = Object.entries(this.cfg.EVENTS)
      .filter(([type, e]) => this.zone.index >= e.minZone && type !== this.lastEvent)
      .map(([type]) => type);
    return options.length ? this.courseRng.pick(options) : null;
  }

  _startEvent(type) {
    const cfg = this.cfg.EVENTS[type];
    this.event = { type, t: 0, duration: cfg.duration, waves: 0, waveTimer: 1.2, spawned: [], nextMeteor: 0.5 };
    this.lastEvent = type;
    this._emit('eventStart', { event: type, duration: cfg.duration });
  }

  _updateEvent(dt) {
    const ev = this.event;
    if (!ev) return;
    ev.t += dt;
    const cfg = this.cfg.EVENTS[ev.type];
    if (ev.type === 'meteors') {
      ev.nextMeteor -= dt;
      if (ev.nextMeteor <= 0 && ev.t < cfg.duration - cfg.fuse) {
        this._spawnMeteor(this.rng.chance(0.55) ? this.player.lane : this.rng.int(0, this.cfg.LANES.count - 1));
        ev.nextMeteor = cfg.every;
      }
    } else if (ev.type === 'ambush') {
      if (ev.waves < cfg.waves) {
        ev.waveTimer -= dt;
        if (ev.waveTimer <= 0) {
          this._spawnAmbushWave(ev.waves);
          ev.waves += 1;
          ev.waveTimer = cfg.waveEvery;
        }
      } else if (ev.spawned.every((e) => e.dead || e.z + e.d / 2 <= this.cfg.WORLD.despawnZ)) {
        this._endEvent();
        return;
      }
    }
    if (ev.t >= ev.duration) this._endEvent();
  }

  _endEvent() {
    const ev = this.event;
    if (!ev) return;
    let success = true;
    let reward = 0;
    if (ev.type === 'ambush') {
      success = ev.waves > 0 && ev.spawned.every((e) => e.killed);
      if (success) {
        reward = this.cfg.EVENTS.ambush.reward;
        this.score.addCoin(reward);
      }
    }
    this.event = null;
    // Only events seen through (an ambush must be cleared) count for missions and XP.
    if (success) this.stats.events += 1;
    this._emit('eventEnd', { event: ev.type, success, reward });
  }

  /** Enemy waves of an ambush: a bit tougher in later zones. */
  _spawnAmbushWave(index) {
    const lanes = [0, 1, 2];
    const free = this.rng.int(0, 2);
    const used = lanes.filter((l) => l !== free);
    const z0 = 48;
    const zone = this.zone.index;
    const waves = [
      [{ type: 'walker', lane: used[0], dz: 0 }, { type: 'walker', lane: used[1], dz: 4 }],
      [{ type: 'drone', lane: free, dz: 0 }, { type: zone >= 1 ? 'charger' : 'walker', lane: used[0], dz: 6 }],
      [{ type: 'walker', lane: used[0], dz: 0 }, { type: zone >= 2 ? 'turret' : 'crate', lane: used[1], dz: 2 }, { type: 'drone', lane: free, dz: 8 }],
    ];
    for (const item of waves[index % waves.length]) this.event.spawned.push(this._addEntity(item, z0));
  }

  /** A meteor that lands where the player would be if they stayed in `lane`. */
  _spawnMeteor(lane) {
    const fuse = this.cfg.EVENTS.meteors.fuse;
    const impactZ = this.rng.range(-0.5, 1.0);
    const e = this._addEntity({ type: 'meteor', lane, dz: 0 }, impactZ + this.speed * fuse);
    e.fuse = fuse;
    e.maxFuse = fuse;
    this._emit('meteorWarn', { id: e.id, lane, x: e.x, z: e.z });
    return e;
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
    this.zone = { index: this.zone.index + 1, start: this.distance, bossDone: false, cooldown: 2.5, eventsDone: 0 };
    this._emit('zone', { index: this.zone.index });
    // Pick one of three perks before the next zone (the scene pauses for it).
    const offer = this.rollPerks(3);
    this.perkOffer = offer.length ? offer : null;
    if (this.perkOffer) this._emit('perkOffer', { options: [...this.perkOffer] });
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
      case 'meteors': {
        // Two lanes blasted, one left free.
        const free = this.rng.int(0, lanes - 1);
        for (let lane = 0; lane < lanes; lane++) if (lane !== free) this._spawnMeteor(lane);
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
      // Hovering drones / bombers and a winding-up ram keep pace with the player.
      if ((e.type === 'drone' || e.type === 'bomber') && e.state !== 'approach') continue;
      if (e.type === 'charger' && e.state === 'windup') continue;
      if (e.type === 'charger') e.prevZ = e.z; // for the swept collision below
      e.z -= dz;
      if (e.type === 'walker') e.z -= this.cfg.ENEMIES.walker.walk * dt;
      else if (e.type === 'charger' && e.state === 'charge') e.z -= this.cfg.ENEMIES.charger.charge * dt;
    }
    if (this.spawnPaused) return;

    const bossPhase = this.boss || (!this.zone.bossDone && this.zoneProgress >= this.bossAt - 60);
    this.distanceToNext -= dz;
    while (this.distanceToNext <= 0) {
      const z0 = WORLD.spawnZ + this.distanceToNext;
      const ev = this.event?.type;
      const quiet = bossPhase || this.zone.cooldown > 0 || ev === 'ambush' || ev === 'meteors' || this.mode === 'bossRush';
      const pattern =
        ev === 'goldRush'
          ? this.spawner.goldRush(this.speed)
          : quiet
            ? this.spawner.coinsOnly(this.speed)
            : this.spawner.next(this.level, this.speed);
      for (const item of pattern.items) this._addEntity(item, z0);

      if (!bossPhase && !ev && this.time >= this.nextPowerupAt) {
        const type = this._pickPowerup();
        this._addEntity({ type, lane: this.courseRng.int(0, 2), dz: pattern.length + pattern.gapAfter / 2, y: 0.5 }, z0);
        this.nextPowerupAt = this.time + this.courseRng.range(...POWERUPS.spawnEvery) * (this.perks.lucky ? PERK_TUNING.luckyEvery : 1);
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
    // The jetpack is rarer, and never during a flight already.
    // (the draw always happens, so the course stays the same whatever the player state)
    const jet = this.courseRng.chance(0.5);
    if (p.jetpack <= 0 && jet) pool.push('jetpack');
    if (p.hp < this.maxHp) pool.push('heart', 'heart');
    return this.courseRng.pick(pool);
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
      case 'walker':
      case 'charger':
      case 'turret': {
        const s = ENEMIES[item.type];
        const hp = s.hp + Math.floor(this.zone.index / 2);
        e = { ...base, kind: 'enemy', y: 0, w: s.w, h: s.h, d: s.d, hp, maxHp: hp, phase: this.rng.next() * 6 };
        if (item.type === 'charger') Object.assign(e, { state: 'approach', windupZ: this.rng.range(...s.windupZ), windup: s.windup });
        if (item.type === 'turret') e.fireTimer = s.fireEvery * 0.5;
        break;
      }
      case 'bomber': {
        const s = ENEMIES.bomber;
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
          dropTimer: this.rng.range(...s.dropEvery) * 0.6,
          hopTimer: this.rng.range(...s.hop),
          targetLane: item.lane,
          phase: this.rng.next() * 6,
        };
        break;
      }
      case 'slider': {
        const s = OBSTACLES.slider;
        e = { ...base, kind: 'obstacle', y: 0, w: s.w, h: s.h, d: s.d, phase: this.rng.next() * Math.PI * 2, period: s.period };
        break;
      }
      case 'gap': {
        const s = OBSTACLES.gap;
        e = { ...base, kind: 'obstacle', y: s.y, w: s.w, h: s.h, d: item.length ?? s.d };
        break;
      }
      case 'meteor': {
        const s = this.cfg.METEOR;
        e = { ...base, kind: 'hazard', y: 0, w: s.w, h: s.h, d: s.d, fuse: 1, maxFuse: 1 };
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

    // Jetpack: rise to cruising height and hover over everything.
    if (p.jetpack > 0) {
      const { JETPACK } = this.cfg;
      p.jetpack = Math.max(0, p.jetpack - dt);
      p.y = Math.min(JETPACK.height, p.y + JETPACK.rise * dt);
      p.vy = 0;
      p.grounded = false;
      p.slide = 0;
      if (p.jetpack === 0) {
        p.invulnerable = Math.max(p.invulnerable, JETPACK.landingGrace);
        this._emit('jetpackEnd', {});
      }
      return;
    }

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
    const chest = this.cfg.BULLETS.height;
    const y = p.y + (p.slide > 0 ? 0.5 : chest);
    // From the jetpack, shots dive to chest height over ~12 m to hit ground enemies.
    const vy = y > chest + 0.5 ? ((chest - y) * w.speed) / 12 : 0;
    const shot = (x, vx = 0) => this.shots.push({ id: this.nextId++, x, y, vy, z: 0.6, vx, damage: w.damage, speed: w.speed, pierce: !!w.pierce, hits: new Set() });

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
    if (w.multishot) {
      shot(p.x, -2.6);
      shot(p.x, 2.6);
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
      } else if (e.type === 'bomber') {
        this._updateBomber(e, dt);
      } else if (e.type === 'charger') {
        if (e.state === 'approach' && e.z <= e.windupZ) {
          e.state = 'windup';
          this._emit('chargerWindup', { id: e.id, x: e.x, z: e.z });
        } else if (e.state === 'windup') {
          e.windup -= dt;
          if (e.windup <= 0) {
            e.state = 'charge';
            this._emit('chargerCharge', { id: e.id, x: e.x, z: e.z });
          }
        }
      } else if (e.type === 'turret') {
        const [near, far] = ENEMIES.turret.range;
        if (e.z > near && e.z < far) {
          e.fireTimer -= dt * zoneBoost;
          if (e.fireTimer <= 0) {
            this._enemyShot(e.x, e.z - 0.8, 'turret');
            e.fireTimer = ENEMIES.turret.fireEvery;
          }
        }
      } else if (e.type === 'slider') {
        // Glides across the road: lane 0 <-> lane 2.
        e.phase += (dt * Math.PI * 2) / e.period;
        e.x = Math.sin(e.phase) * LANES.width;
        e.lane = Math.round(e.x / LANES.width) + 1;
      } else if (e.type === 'meteor') {
        e.fuse -= dt;
        if (e.fuse <= 0) this._meteorImpact(e);
      }
    }
    this._updateBoss(dt);
  }

  _updateBomber(e, dt) {
    const { ENEMIES, LANES } = this.cfg;
    if (e.state === 'approach' && e.z <= e.holdZ) e.state = 'hold';
    if (e.state === 'hold') {
      e.stay -= dt;
      e.hopTimer -= dt;
      if (e.hopTimer <= 0) {
        e.targetLane = this.rng.int(0, LANES.count - 1);
        e.hopTimer = this.rng.range(...ENEMIES.bomber.hop);
      }
      const tx = laneX(e.targetLane);
      e.x += Math.max(-5 * dt, Math.min(5 * dt, tx - e.x));
      e.dropTimer -= dt;
      if (e.dropTimer <= 0 && Math.abs(e.x - tx) < 0.2) {
        // The mine falls right below and then scrolls towards the player.
        const mine = this._addEntity({ type: 'mine', lane: e.targetLane, dz: 0 }, e.z - 1.5);
        this._emit('bomberDrop', { id: e.id, x: e.x, y: e.y, z: e.z, mine: mine.id });
        e.dropTimer = this.rng.range(...ENEMIES.bomber.dropEvery);
      }
      if (e.stay <= 0) e.state = 'leave';
    } else if (e.state === 'leave') {
      e.y += 4 * dt;
      e.z += 10 * dt;
      if (e.y > 9) e.dead = true;
    }
  }

  /** A meteor lands: hurts the player if they are still on its lane (and not flying high). */
  _meteorImpact(e) {
    const p = this.player;
    const r = this.cfg.EVENTS.meteors.radius;
    e.dead = true;
    const hit = Math.abs(p.x - e.x) < e.w / 2 + this.cfg.PLAYER.width / 2 - 0.1 && Math.abs(e.z) < r + this.cfg.PLAYER.depth / 2 && p.y < 1.2;
    this._emit('meteorImpact', { id: e.id, x: e.x, z: e.z, hit });
    if (hit) this._damage('meteor');
  }

  // ------------------------------------------------------------- shots

  _updateShots(dt) {
    const { BULLETS } = this.cfg;
    for (const s of this.shots) {
      if (s.dead) continue;
      const prevZ = s.z;
      s.z += s.speed * dt;
      s.x += s.vx * dt;
      if (s.vy) {
        s.y += s.vy * dt;
        if (s.y <= this.cfg.BULLETS.height) {
          s.y = this.cfg.BULLETS.height;
          s.vy = 0;
        }
      }
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
        if (SHOTS_PASS.has(e.type)) continue; // shots fly over barriers, holes and markers
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
    e.killed = true;
    const { SCORE } = this.cfg;
    const c = this.combo;
    const comboPerk = this.perks.combo > 0;
    c.count = c.timer > 0 ? Math.min(comboPerk ? PERK_TUNING.comboMax : SCORE.comboMax, c.count + 1) : 1;
    c.timer = SCORE.comboWindow * (comboPerk ? PERK_TUNING.comboWindow : 1);
    c.best = Math.max(c.best, c.count);
    const mult = this.player.double > 0 ? 2 : 1;
    const points = Math.round((SCORE.kill[e.type] ?? 10) * c.count * mult * this.modifiers.score);
    this.score.addBonus(points);
    this.stats.kills += e.type === 'crate' || e.type === 'mine' ? 0 : 1;
    if (e.type === 'drone') this.stats.drones += 1;
    if (e.type === 'walker') this.stats.walkers += 1;
    if (e.type === 'crate') this.stats.crates += 1;
    if (e.type === 'charger') this.stats.chargers += 1;
    if (e.type === 'turret') this.stats.turrets += 1;
    if (e.type === 'bomber') this.stats.bombers += 1;
    this._emit('kill', { id: e.id, enemy: e.type, x: e.x, y: e.y + e.h / 2, z: e.z, points, combo: c.count });
    if (c.count >= 2) this._emit('combo', { count: c.count });

    // Loot: a few coins (and sometimes a gem) pop out.
    const coins = { drone: 3, bomber: 3, turret: 3, mine: 0 }[e.type] ?? 2;
    for (let i = 0; i < coins; i++) {
      this._addEntity({ type: 'coin', lane: e.lane ?? 1, dz: 1.2 + i * 1.6, y: 0.6 }, e.z).x = e.x;
    }
    if ((e.type === 'drone' || e.type === 'bomber') && this.rng.chance(0.2)) this._addEntity({ type: 'gem', lane: e.lane ?? 1, dz: 6, y: 0.7 }, e.z).x = e.x;

    // Perks: vampire heals every N kills, explosive kills chain.
    if (this.perks.vampire && e.type !== 'crate' && e.type !== 'mine') {
      this.stats.killsSinceHeal += 1;
      if (this.stats.killsSinceHeal >= PERK_TUNING.vampireKills) {
        this.stats.killsSinceHeal = 0;
        if (this.player.hp < this.maxHp) {
          this.player.hp += 1;
          this._emit('heal', { source: 'vampire' });
        }
      }
    }
    if (this.perks.explosive) {
      this._emit('explosion', { x: e.x, y: e.y + e.h / 2, z: e.z, radius: PERK_TUNING.explosionRadius });
      for (const o of this.entities) {
        if (o.dead || o === e || o.kind !== 'enemy') continue;
        if (Math.hypot(o.x - e.x, o.z - e.z) < PERK_TUNING.explosionRadius) this._damageEnemy(o, PERK_TUNING.explosionDamage);
      }
    }
  }

  // -------------------------------------------------------- collisions

  _playerCollisions() {
    const p = this.player;
    const box = this.playerBox();
    const tol = this.cfg.WORLD.landTolerance;

    for (const e of this.entities) {
      if (e.dead || e.kind === 'pickup' || e.kind === 'hazard') continue;
      const b = entityBox(e);
      // A charging ram moves ~3 m per step at low frame rates: sweep its box
      // back to where it was, so it cannot jump through the player.
      if (e.type === 'charger' && e.prevZ !== undefined) b.z1 = Math.max(b.z1, e.prevZ + e.d / 2);
      if (!overlaps(box, b)) continue;
      if (e.type === 'platform') {
        if (p.y < e.y + e.h - tol) this._crash(e);
      } else if (e.kind === 'obstacle') {
        this._crash(e);
      } else if (CONTACT_ENEMIES.has(e.type)) {
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
      const radius = p.magnet > 0 ? POWERUPS.magnetRadius : this.perks.magnet ? PERK_TUNING.magnetRadius : 0;
      if (radius > 0 && (e.type === 'coin' || e.type === 'gem')) {
        const dx = cx - e.x;
        const dy = cy - e.y;
        const dzz = -e.z;
        const dist = Math.hypot(dx, dy, dzz);
        if (e.attracted || dist < radius) {
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
    const lucky = this.perks.lucky ? PERK_TUNING.luckyDuration : 1;
    switch (e.type) {
      case 'coin': {
        // "Coins" perk: a chance per level that the coin counts double.
        const extra = this.perks.coins && this.rng.chance(0.5 * this.perks.coins) ? 1 : 0;
        this.score.addCoin(1 + extra);
        if (mult > 1) this.score.addBonus(this.cfg.SCORE.coin);
        break;
      }
      case 'gem':
        this.score.addGem(1);
        if (mult > 1) this.score.addBonus(this.cfg.SCORE.gem);
        break;
      case 'shield':
        p.shield = true;
        break;
      case 'magnet':
        p.magnet = (POWERUPS.magnet + this.loadout.magnetLevel * 2) * lucky;
        break;
      case 'rapid':
        p.rapid = POWERUPS.rapid * lucky;
        break;
      case 'double':
        p.double = POWERUPS.double * lucky;
        break;
      case 'jetpack':
        this._startJetpack();
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

  /** Jetpack flight: sky coins along the way, nothing on the ground can reach. */
  _startJetpack() {
    const { JETPACK } = this.cfg;
    const p = this.player;
    p.jetpack = JETPACK.duration * (this.perks.lucky ? PERK_TUNING.luckyDuration : 1);
    p.slide = 0;
    const length = this.speed * p.jetpack;
    let lane = p.lane;
    for (let dz = 8; dz < length - 6; dz += 2.6) {
      if (this.rng.chance(0.08)) lane = Math.max(0, Math.min(2, lane + this.rng.pick([-1, 1])));
      this._addEntity({ type: 'coin', lane, dz, y: JETPACK.height + 0.4 }, 0);
    }
    this._emit('jetpack', { duration: p.jetpack });
  }

  _updateTimers(dt) {
    const p = this.player;
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    // "Shield regen" perk: a lost shield comes back after a while.
    if (this.perks.shieldRegen && !p.shield) {
      p.shieldRegen = p.shieldRegen > 0 ? p.shieldRegen - dt : PERK_TUNING.shieldRegen;
      if (p.shieldRegen <= 0) {
        p.shield = true;
        p.shieldRegen = 0;
        this._emit('shieldRegen', {});
      }
    }
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
    p.jetpack = 0;
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
      zoneProgress: Math.min(1, this.zoneProgress / this.bossAt),
      boss: b ? { hp: Math.max(0, b.hp), maxHp: b.maxHp, leaving: b.leaving, kind: b.bossKind } : null,
      fireReady: p.fireCooldown <= 0,
      jetpack: p.jetpack,
      event: this.event ? { type: this.event.type, left: Math.max(0, this.event.duration - this.event.t), duration: this.event.duration } : null,
      perks: { ...this.perks },
    };
  }
}
