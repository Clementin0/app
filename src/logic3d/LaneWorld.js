import { GAME3D, laneX } from '../config/game3d.config.js';
import { getPerk, PERK_TUNING, PERKS } from '../config/perks.js';
import { goalProgress } from '../config/campaign.js';
import { zoneTheme } from '../config/zones.js';
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
// Shots fly over these (low obstacles, holes, meteor markers, pads on the road).
const SHOTS_PASS = new Set(['barrier', 'slider', 'gap', 'meteor', 'turbo', 'ramp', 'fence']);
// Enemies that hurt on contact (and break).
const CONTACT_ENEMIES = new Set(['walker', 'crate', 'mine', 'charger', 'turret', 'guard', 'car']);
// Parkour: what can be cleared in style (jumped over, slid under, run on).
const TRICK_TYPES = new Set(['barrier', 'beam', 'slider', 'gap', 'fence', 'wall', 'crate', 'platform']);
// Things worth a "near miss" when they pass in the lane you just left.
const NEAR_MISS_TYPES = new Set(['wall', 'barrier', 'beam', 'slider', 'platform', 'fence', 'crate', 'walker', 'charger', 'turret', 'mine', 'guard', 'car']);

/**
 * Optional rules of a run (daily challenge, boss rush): speed and score
 * multipliers, fixed hearts or weapon, forced events, bosses sooner.
 */
export const DEFAULT_MODIFIERS = Object.freeze({ speed: 1, score: 1, hp: null, weapon: null, event: null, bossAt: null, noShoot: false, weights: null });

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
  constructor({ rng, config = GAME3D, best = 0, loadout = {}, mode = 'endless', modifiers = {}, courseSeed = null, campaign = null } = {}) {
    this.cfg = config;
    this.rng = rng ?? createRng();
    // The course (rows, power-ups, events) can have its own seed, so the
    // daily challenge stays the same whatever the player shoots.
    this.courseRng = courseSeed === null ? this.rng : createRng(courseSeed);
    // A campaign level: a goal, a starting zone and its own rules.
    this.campaign = campaign;
    // 'endless' | 'daily' | 'bossRush' | 'timeAttack' | 'campaign' | 'assault' | 'chaos' | 'parkour' | 'hardcore'
    this.mode = campaign ? 'campaign' : mode;
    const H = config.HARDCORE;
    const rules = this.mode === 'parkour' ? { noShoot: true, weights: config.PARKOUR.weights } : this.mode === 'hardcore' ? { hp: H.hp, speed: H.speed, score: H.score } : {};
    this.modifiers = { ...DEFAULT_MODIFIERS, ...rules, ...(campaign?.modifiers ?? {}), ...modifiers, ...(campaign?.weights ? { weights: campaign.weights } : {}) };
    this.loadout = { ...DEFAULT_LOADOUT, ...loadout };
    if (this.modifiers.weapon) this.loadout.weapon = this.modifiers.weapon;
    this.spawner = new LaneSpawner(this.courseRng, config);
    this.score = new ScoreManager({ scoring: { pointsPerMeter: 1, coinValue: config.SCORE.coin, gemValue: config.SCORE.gem }, pixelsPerMeter: 1, best });
    this.nextId = 1;
    this.reset();
  }

  // ------------------------------------------------------------- setup

  get weaponStats() {
    return this._weaponStats(this.player?.overdrive > 0);
  }

  _weaponStats(overdrive) {
    const base = this.cfg.WEAPONS_STATS[this.loadout.weapon] ?? this.cfg.WEAPONS_STATS.blaster;
    const perk = (id) => this.perks?.[id] ?? 0;
    const od = overdrive ? this.cfg.OVERDRIVE : null;
    return {
      ...base,
      damage: base.damage * (1 + 0.35 * this.loadout.damageLevel) * (1 + PERK_TUNING.damagePerLevel * perk('damage')) * (od?.damage ?? 1),
      interval: base.interval * Math.pow(0.9, this.loadout.fireRateLevel) * Math.pow(PERK_TUNING.fireRatePerLevel, perk('fireRate')) * (od?.fireRate ?? 1),
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
    // Assault: bosses come with the waves; parkour: no bosses at all.
    if (this.mode === 'assault' || this.mode === 'parkour') return Infinity;
    return this.modifiers.bossAt ?? this.cfg.ZONES.bossAt;
  }

  reset() {
    const { SPEED, POWERUPS } = this.cfg;
    this.time = 0;
    // Course clock: runs faster in turbo (as the distance does), so the
    // course (rows, power-ups, events) depends on the distance only, not
    // on whether the player took a turbo pad.
    this.courseTime = 0;
    this.courseSpeed = SPEED.start;
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
    this.waves = []; // boss quakes and lasers rolling towards the player
    this.boss = null;
    this.zone = { index: this.campaign?.zone ?? 0, start: 0, bossDone: false, cooldown: 0, eventsDone: 0 };
    this.level = Math.min(8, this.zone.index * 2);
    this.timeLeft = this.mode === 'timeAttack' ? this.cfg.TIME_ATTACK.start : null;
    this.rowsSinceClock = 0;
    this.perks = {};
    this.startFirepower = this.firepower; // boss rush health scales from here
    this.perkOffer = null; // 3 perk ids to choose from, after a boss
    this.event = null; // run event in progress (gold rush, ambush, meteors)
    this.lastEvent = null;
    const A = this.cfg.ASSAULT;
    this.assault = this.mode === 'assault' ? { wave: 0, state: 'intro', timer: A.firstWave, groups: [], groupTimer: 0, spawned: [], total: 0 } : null;
    this.chaos = this.mode === 'chaos' ? { timer: this.cfg.CHAOS.first, mult: 1, done: 0, bag: [], last: null } : null;
    this.mutator = null; // chaos mutation in progress
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
      turbo: 0, // seconds of turbo left
      turboK: 0, // 0..1, smoothed turbo strength (speed)
      rockets: 0, // seconds of homing rockets left
      rocketTimer: 0,
      rocketSide: 1,
      rampId: null, // the ramp under the runner
      floaty: false, // airborne since a low gravity jump
      od: 0, // overdrive meter, 0..1
      overdrive: 0, // real seconds of overdrive left
      fromLane: 1, // lane left by the last lane change (near misses)
      laneChangedAt: -9,
    };
    this.combo = { count: 0, timer: 0, best: 0 };
    // Tutorial hooks: no random rows, and nothing can hurt the player.
    this.spawnPaused = false;
    this.safe = false;
    this.stats = { kills: 0, drones: 0, walkers: 0, crates: 0, chargers: 0, turrets: 0, bombers: 0, bosses: 0, jumps: 0, slides: 0, shots: 0, events: 0, perks: 0, killsSinceHeal: 0, turbos: 0, ramps: 0, smashed: 0, nearMisses: 0, overdrives: 0, snipers: 0, guards: 0, cars: 0, hits: 0, clocks: 0, waves: 0, mutations: 0, tricks: 0 };
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
    // Chaos "mirror": left is right and right is left.
    if (this.mutator?.id === 'mirror') dir = -dir;
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
    p.fromLane = p.lane;
    p.laneChangedAt = this.time;
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
    p.vy = this.cfg.PLAYER.jumpVelocity * (this.lowGravity?.jump ?? 1);
    p.floaty = !!this.lowGravity; // stays floaty until landing
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
    this.player.firing = !!firing && !this.modifiers.noShoot;
  }

  /** Single tap: fire as soon as the weapon is ready. */
  fire() {
    if (this.state !== 'running' || this.modifiers.noShoot) return;
    this.player.queuedShots = Math.min(2, this.player.queuedShots + 1);
  }

  // -------------------------------------------------------- simulation

  step(dt) {
    if (this.state !== 'running') return;
    const real = Math.min(dt, this.cfg.WORLD.maxStep);
    if (!(real > 0)) return;
    // Overdrive: bullet time. The world slows down, the overdrive runs in real time.
    const p0 = this.player;
    let delta = real;
    if (p0.overdrive > 0) {
      p0.overdrive = Math.max(0, p0.overdrive - real);
      delta = real * this.cfg.OVERDRIVE.timeScale;
      if (p0.overdrive === 0) this._emit('overdriveEnd', {});
    }

    this.time += delta;
    const turbo = 1 + (this.cfg.TURBO.speed - 1) * this.player.turboK;
    const courseDelta = delta * turbo;
    this.courseTime += courseDelta;
    const level = Math.min(8, Math.floor(this.courseTime / 18) + this.zone.index * 2);
    if (level > this.level) {
      this.level = level;
      this._emit('levelUp', { level });
    }
    this.courseSpeed = this._speedAt(this.courseTime);
    this.speed = this.courseSpeed * turbo;
    const dz = this.speed * delta;
    this.distance += dz;
    this.score.addDistance(dz * (this.player.double > 0 ? 2 : 1) * this.scoreMult);

    this._updateZone(courseDelta);
    this._updateEvent(courseDelta);
    this._scrollAndSpawn(delta, dz);
    this._updatePlayer(delta);
    this._updateWeapon(delta);
    this._updateRockets(delta);
    this._updateEnemies(delta);
    this._updateShots(delta);
    if (this.state === 'running') this._playerCollisions();
    if (this.state === 'running') this._updatePickups(delta);
    this._updateTimers(delta);
    this._cleanup();
    this._updateMode(delta);

    if (this.score.checkPassedBest()) this._emit('newBest', { score: this.score.score });
  }

  // ------------------------------------------------- campaign & time attack

  /** Progress towards the campaign goal (0 outside the campaign). */
  get goalProgress() {
    return this.campaign ? goalProgress(this.campaign.goal, this) : 0;
  }

  _updateMode(dt) {
    if (this.state !== 'running') return;
    if (this.campaign && this.goalProgress >= this.campaign.goal.value) {
      this.state = 'won';
      this.player.firing = false;
      this._emit('levelComplete', { level: this.campaign.id, hits: this.stats.hits, coins: this.score.coins });
      return;
    }
    if (this.timeLeft !== null) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft === 0) this._die('time');
    }
  }

  /** Time attack: seconds added (clocks, kills, near misses, bosses). */
  _addTime(seconds, source) {
    if (this.timeLeft === null || seconds <= 0) return;
    this.timeLeft += seconds;
    this._emit('timeBonus', { seconds, source });
  }

  /**
   * Course speed (without the turbo) at a course time: ramp, slowed by the
   * "slowmo" perk, scaled by events and modifiers. Rows are laid out for it.
   */
  _speedAt(time) {
    const { SPEED } = this.cfg;
    const top = SPEED.max * (this.perks.slowmo ? PERK_TUNING.slowmo : 1);
    // Time attack ramps up faster.
    const ramp = this.mode === 'timeAttack' ? this.cfg.TIME_ATTACK.rampTime : SPEED.rampTime;
    const base = top - (top - SPEED.start) * Math.exp(-time / ramp);
    const event = this.event ? (this.cfg.EVENTS[this.event.type]?.speed ?? 1) : 1;
    const hyper = this.mutator?.id === 'hyper' ? this.cfg.CHAOS.hyper : 1;
    return base * event * this.modifiers.speed * hyper;
  }

  /** Score multiplier of the run (daily modifiers, storm event). */
  get scoreMult() {
    const ev = this.event?.type;
    const event = ev === 'storm' || ev === 'blackout' ? this.cfg.EVENTS[ev].score : 1;
    const od = this.player?.overdrive > 0 ? this.cfg.OVERDRIVE.score : 1;
    return this.modifiers.score * event * od * (this.chaos?.mult ?? 1);
  }

  // ---------------------------------------------------------- overdrive

  /** Adds to the overdrive meter (not while it runs). */
  _gainOverdrive(amount) {
    const p = this.player;
    if (p.overdrive > 0 || p.od >= 1) return;
    p.od = Math.min(1, p.od + amount);
    if (p.od >= 1) this._emit('overdriveReady', {});
  }

  /** Triggers the overdrive when the meter is full. */
  activateOverdrive() {
    const p = this.player;
    if (this.state !== 'running' || p.od < 1 || p.overdrive > 0) return false;
    p.od = 0;
    p.overdrive = this.cfg.OVERDRIVE.duration;
    this.stats.overdrives += 1;
    this._emit('overdrive', { duration: p.overdrive });
    return true;
  }

  /**
   * Low gravity in effect (its tuning), or null. It starts once the rows
   * laid out for normal gravity have gone by (the event's `delay`).
   */
  get lowGravity() {
    const ev = this.event;
    return ev?.type === 'lowGravity' && ev.t >= ev.delay ? this.cfg.EVENTS.lowGravity : null;
  }

  // ------------------------------------------------------------- perks

  /** Up to `n` distinct perks that are not maxed yet. */
  rollPerks(n = 3) {
    // Boss rush: no healing loops or coin perks; hardcore: one heart means one heart.
    const banned = this.mode === 'bossRush' ? this.cfg.BOSS_RUSH.noPerks : this.mode === 'hardcore' ? this.cfg.HARDCORE.noPerks : [];
    const pool = PERKS.filter((p) => this.perkLevel(p.id) < p.max && !banned.includes(p.id)).map((p) => p.id);
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
    this.nextPowerupAt = this.courseTime + this.courseRng.range(...this.cfg.POWERUPS.spawnEvery);
    this.zone.start = this.distance;
  }

  get zoneProgress() {
    return this.distance - this.zone.start;
  }

  _updateZone(dt) {
    const { ZONES } = this.cfg;
    if (this.zone.cooldown > 0) this.zone.cooldown = Math.max(0, this.zone.cooldown - dt);
    if (this.assault) {
      this._updateAssault(dt);
      return;
    }
    if (!this.boss && !this.zone.bossDone && !this.event && this.zoneProgress >= this.bossAt) {
      this._spawnBoss();
      return;
    }
    // Parkour: a new zone every kilometer, no boss in between.
    if (this.mode === 'parkour' && !this.event && this.zoneProgress >= this.cfg.PARKOUR.zoneEvery) this._nextZone(1.5);
    if (this.chaos) {
      this._updateChaos(dt);
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
    const theme = zoneTheme(this.zone.index).id;
    const allowed = this.mode === 'parkour' ? this.cfg.PARKOUR.events : null;
    const options = Object.entries(this.cfg.EVENTS)
      .filter(([type, e]) => this.zone.index >= e.minZone && type !== this.lastEvent && (!e.themes || e.themes.includes(theme)) && (!allowed || allowed.includes(type)))
      .map(([type]) => type);
    return options.length ? this.courseRng.pick(options) : null;
  }

  _startEvent(type, duration = null) {
    const cfg = this.cfg.EVENTS[type];
    // Low gravity waits for the rows already on the road (laid out for normal jumps).
    const z = this.cfg.WORLD.spawnZ;
    const v = Math.max(1, this.courseSpeed);
    // Traffic: the first car must not meet the rows already on the road.
    const delay = type === 'lowGravity' ? z / v : type === 'traffic' ? z / v - z / (v + this.cfg.ENEMIES.car.speed) + 0.5 : 0;
    const length = duration ?? cfg.duration;
    this.event = { type, t: 0, delay, duration: length + delay, waves: 0, waveTimer: 1.2, spawned: [], nextMeteor: 0.5, nextCar: delay };
    this.lastEvent = type;
    this._emit('eventStart', { event: type, duration: length });
  }

  _updateEvent(dt) {
    const ev = this.event;
    if (!ev) return;
    ev.t += dt;
    const cfg = this.cfg.EVENTS[ev.type];
    if (ev.type === 'meteors') {
      ev.nextMeteor -= dt;
      if (ev.nextMeteor <= 0 && ev.t < ev.duration - cfg.fuse) {
        this._spawnMeteor(this.rng.chance(0.55) ? this.player.lane : this.rng.int(0, this.cfg.LANES.count - 1));
        ev.nextMeteor = cfg.every;
      }
    } else if (ev.type === 'traffic') {
      ev.nextCar -= dt;
      if (ev.nextCar <= 0 && ev.t < ev.duration - 2) {
        // One lane, sometimes two: never all three.
        const lanes = [0, 1, 2];
        const first = lanes.splice(this.rng.int(0, 2), 1)[0];
        const cars = [first];
        if (this.rng.chance(cfg.double)) cars.push(this.rng.pick(lanes));
        for (const lane of cars) this._addEntity({ type: 'car', lane, dz: 0 }, this.cfg.WORLD.spawnZ);
        this._emit('carIncoming', { lanes: cars });
        ev.nextCar = this.rng.range(...cfg.every);
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

  // ------------------------------------------------------------ assault

  _updateAssault(dt) {
    const a = this.assault;
    const A = this.cfg.ASSAULT;
    if (a.state === 'intro') {
      // The next wave waits for the perk choice and the zone change.
      if (this.perkOffer || this.spawnPaused || this.zone.cooldown > 0) return;
      a.timer -= dt;
      if (a.timer <= 0) this._startWave();
    } else if (a.state === 'wave') {
      if (a.groups.length) {
        a.groupTimer -= dt;
        if (a.groupTimer <= 0) {
          for (const item of a.groups.shift()) a.spawned.push(this._addEntity(item, A.spawnZ));
          a.groupTimer = this.rng.range(...A.groupEvery);
        }
      } else if (a.spawned.every((e) => e.dead || e.z + e.d / 2 <= this.cfg.WORLD.despawnZ)) {
        this._clearWave(false);
      }
    } else if (a.state === 'boss' && !this.boss) {
      this._clearWave(true);
    }
  }

  _startWave() {
    const a = this.assault;
    a.wave += 1;
    const boss = a.wave % this.cfg.ASSAULT.bossEvery === 0;
    a.spawned = [];
    a.groupTimer = 0;
    if (boss) {
      a.state = 'boss';
      a.groups = [];
      a.total = 1;
      this._spawnBoss();
    } else {
      a.state = 'wave';
      a.groups = this._assaultGroups(a.wave);
      a.total = a.groups.reduce((n, g) => n + g.length, 0);
    }
    this._emit('waveStart', { wave: a.wave, boss, enemies: a.total });
  }

  /**
   * The enemies of a wave, in groups that arrive one after the other. A
   * group never puts three enemies on the ground: one lane always stays open.
   */
  _assaultGroups(n) {
    const A = this.cfg.ASSAULT;
    const pool = Object.entries(A.unlock)
      .filter(([, from]) => n >= from)
      .map(([type]) => type);
    let left = Math.min(A.maxEnemies, 3 + Math.floor(n * 0.9));
    let flyers = 0;
    const groups = [];
    while (left > 0) {
      const size = Math.min(left, this.rng.int(1, n >= 4 ? 3 : 2));
      const lanes = [0, 1, 2];
      for (let i = lanes.length - 1; i > 0; i--) {
        const j = this.rng.int(0, i);
        [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
      }
      const group = [];
      let ground = 0;
      for (let i = 0; i < size; i++) {
        let type = this.rng.pick(pool);
        let flyer = type === 'drone' || type === 'bomber' || type === 'sniper';
        // At most three flyers per wave, two enemies on the ground per group
        // (when both are full, the enemy waits for the next group).
        if (flyer && flyers >= 3) [type, flyer] = ['walker', false];
        if (!flyer && ground >= 2) {
          if (flyers >= 3) break;
          [type, flyer] = ['drone', true];
        }
        if (flyer) flyers += 1;
        else ground += 1;
        group.push({ type, lane: lanes[i], dz: i * 3 });
      }
      groups.push(group);
      left -= group.length;
    }
    return groups;
  }

  _clearWave(boss) {
    const a = this.assault;
    const A = this.cfg.ASSAULT;
    const perfect = boss || a.spawned.every((e) => e.killed);
    const coins = A.coins + A.perWave * a.wave;
    this.score.addCoin(coins);
    const points = perfect && !boss ? Math.round(A.perfect * this.scoreMult) : 0;
    if (points) this.score.addBonus(points);
    this.stats.waves = a.wave;
    a.state = 'intro';
    a.timer = A.pause;
    a.spawned = [];
    this._emit('waveClear', { wave: a.wave, boss, perfect, coins, points });
  }

  // -------------------------------------------------------------- chaos

  _updateChaos(dt) {
    const ch = this.chaos;
    const m = this.mutator;
    if (m) {
      m.t += dt;
      const over = m.event ? this.event?.type !== m.id : m.t >= m.duration;
      if (over) this._endMutator();
      else if (m.id === 'rockets') this.player.rockets = Math.max(this.player.rockets, 0.5);
      else if (m.id === 'magnet') {
        this.player.magnet = Math.max(this.player.magnet, 0.5);
        this.player.double = Math.max(this.player.double, 0.5);
      }
      return;
    }
    if (this.boss || this.event || this.spawnPaused) return;
    ch.timer -= dt;
    if (ch.timer <= 0) this._startMutator(this._nextMutator());
  }

  /** Mutations come in a shuffled bag: all of them before any repeats. */
  _nextMutator() {
    const ch = this.chaos;
    if (!ch.bag.length) {
      const bag = [...this.cfg.CHAOS.mutators];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = this.courseRng.int(0, i);
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag[0] === ch.last) bag.push(bag.shift());
      ch.bag = bag;
    }
    return ch.bag.shift();
  }

  _startMutator(id) {
    const C = this.cfg.CHAOS;
    const event = C.events.includes(id);
    if (event) this._startEvent(id, C.duration);
    this.mutator = { id, t: 0, duration: event ? this.event.duration : C.duration, event };
    this.chaos.last = id;
    this._emit('mutator', { id, duration: C.duration });
  }

  _endMutator() {
    const ch = this.chaos;
    const C = this.cfg.CHAOS;
    const { id } = this.mutator;
    this.mutator = null;
    ch.done += 1;
    ch.mult = Math.min(C.multMax, 1 + C.multStep * ch.done);
    ch.timer = Math.max(2, C.every - C.duration);
    this.stats.mutations = ch.done;
    this._emit('mutatorEnd', { id, mult: ch.mult });
  }

  /** Size of the runner (chaos "tiny"). */
  get playerScale() {
    return this.mutator?.id === 'tiny' ? this.cfg.CHAOS.tiny : 1;
  }

  /** Row weights: chaos mutations, then the run's modifiers (campaign, parkour). */
  _rowWeights() {
    const id = this.mutator?.id;
    if (id === 'swarm' || id === 'fortress') return this.cfg.CHAOS[id];
    return this.modifiers.weights;
  }

  // ------------------------------------------------------------ parkour

  /** A trick (parkour): the chain multiplies its points, a hit breaks it. */
  _trick(kind) {
    const P = this.cfg.PARKOUR;
    const c = this.combo;
    c.count = c.timer > 0 ? Math.min(P.chainMax, c.count + 1) : 1;
    c.timer = P.chainWindow;
    c.best = Math.max(c.best, c.count);
    const points = Math.round(P.trickPoints * c.count * (this.player.double > 0 ? 2 : 1) * this.scoreMult);
    this.score.addBonus(points);
    this.stats.tricks += 1;
    this._gainOverdrive(this.cfg.OVERDRIVE.gain.nearMiss * 0.5);
    this._emit('trick', { kind, chain: c.count, points });
  }

  /** Parkour: an obstacle of the runner's lane went by, cleared in the air or sliding. */
  _trickOver(e) {
    if (!TRICK_TYPES.has(e.type) || (e.type === 'fence' && !e.on)) return;
    const p = this.player;
    if (Math.abs(e.x - p.x) >= e.w / 2 + this.cfg.PLAYER.width / 2 - 0.15) return;
    const kind = e.type === 'platform' ? 'platform' : p.y > 0.35 ? 'air' : p.slide > 0 ? 'slide' : null;
    if (kind) this._trick(kind);
  }

  /** Damage per second of the current weapon, perks included (all shots on a wide target), without the overdrive. */
  get firepower() {
    const w = this._weaponStats(false);
    const shots = (w.pattern === 'twin' ? 2 : w.pattern === 'spread' ? 3 : 1) + (w.multishot ? 2 : 0);
    return (w.damage * shots) / w.interval;
  }

  _spawnBoss() {
    const { BOSS, BOSS_RUSH } = this.cfg;
    const zone = this.zone.index;
    const rush = this.mode === 'bossRush';
    // Boss rush: tougher every time, and as tough as the perks make you strong.
    const hp = rush
      ? Math.round((BOSS_RUSH.hpBase + BOSS_RUSH.hpPerBoss * zone) * Math.pow(Math.max(1, this.firepower / this.startFirepower), BOSS_RUSH.dpsExponent))
      : BOSS.baseHp + BOSS.hpPerZone * zone;
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
      shield: 0, // seconds of shield left
      shieldAt: [...(rush || zone >= 3 ? BOSS.shieldAtLate : BOSS.shieldAt)],
      shieldIndex: 0,
      enraged: false,
    };
    this._emit('bossSpawn', { zone, hp, bossKind: bossKind.id });
  }

  _finishBoss(defeated) {
    const b = this.boss;
    if (!b) return;
    // Its attacks still on the way vanish with it.
    this.waves = [];
    this.eshots = this.eshots.filter((s) => s.source !== 'boss');
    if (defeated) {
      this.stats.bosses += 1;
      const mult = this.player.double > 0 ? 2 : 1;
      this.score.addBonus(this.cfg.SCORE.kill.boss * (this.zone.index + 1) * mult);
      this.score.addCoin(40);
      this.score.addGem(3);
      this._emit('bossDefeated', { x: b.x, y: b.y + b.h / 2, z: b.z, coins: 40, gems: 3 });
      this._gainOverdrive(this.cfg.OVERDRIVE.gain.boss);
      this._addTime(this.cfg.TIME_ATTACK.boss, 'boss');
    } else {
      this._emit('bossFled', {});
      if (this.campaign?.goal.type === 'boss') {
        this.boss = null;
        this._die('bossFled');
        return;
      }
    }
    this.boss = null;
    this._nextZone(2.5);
    // Pick one of three perks before the next zone (the scene pauses for it).
    const offer = this.rollPerks(3);
    this.perkOffer = offer.length ? offer : null;
    if (this.perkOffer) this._emit('perkOffer', { options: [...this.perkOffer] });
  }

  _nextZone(cooldown) {
    this.zone = { index: this.zone.index + 1, start: this.distance, bossDone: false, cooldown, eventsDone: 0 };
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

    const rush = this.mode === 'bossRush';
    // Boss rush and campaign: no escape, the boss gets enraged instead.
    const noEscape = rush || this.mode === 'campaign' || this.mode === 'assault';
    if (b.shield > 0) {
      b.shield = Math.max(0, b.shield - dt);
      if (b.shield === 0) this._emit('bossShieldDown', { x: b.x, y: b.y + b.h / 2, z: b.z });
    }
    if (noEscape && !b.enraged && b.lifetime > (rush ? this.cfg.BOSS_RUSH.enrageAfter : BOSS.timeLimit)) {
      b.enraged = true;
      this._emit('bossEnraged', { x: b.x, y: b.y + b.h / 2, z: b.z });
    }
    if (!noEscape && b.lifetime > BOSS.timeLimit && !b.leaving && b.shield <= 0) {
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
    const { BOSS_RUSH, SHIELD_PATTERNS, BOSS_COMBOS } = this.cfg;
    const n = this.zone.index;
    let pattern;
    if (b.shield > 0) {
      // Shielded: a fast barrage of attacks that have to be dodged.
      pattern = SHIELD_PATTERNS[b.shieldIndex++ % SHIELD_PATTERNS.length];
      b.attackTimer = BOSS.shieldAttackEvery;
    } else {
      pattern = b.patterns[b.attackIndex % b.patterns.length];
      b.attackIndex += 1;
      b.attackTimer = rush
        ? Math.max(BOSS_RUSH.minAttackEvery, BOSS_RUSH.attackEvery - BOSS_RUSH.attackSpeedup * n)
        : Math.max(0.8, BOSS.attackEvery - BOSS.attackSpeedup * n);
      if (b.enraged) b.attackTimer *= BOSS_RUSH.enrageSpeed;
    }
    this._bossAttack(b, pattern);
    // Later on, a second attack comes with the first (always a fair pair).
    const combosFrom = rush ? BOSS_RUSH.combosFrom : BOSS.combosFrom;
    const chance = rush ? BOSS_RUSH.comboChance : BOSS.comboChance;
    const second = BOSS_COMBOS[pattern];
    if (second && b.shield <= 0 && n >= combosFrom && this.rng.chance(chance)) {
      this._bossAttack(b, second);
      b.attackTimer += 0.5; // a little breather after a double attack
    }
  }

  /** Damage to the boss: shields absorb it, and each phase threshold raises one. */
  _damageBoss(b, damage, x, y, z) {
    if (b.shield > 0 || b.leaving) {
      this._emit('shotBlocked', { x, y, z, boss: true });
      return;
    }
    // Thresholds already behind (health set lower elsewhere) are dropped:
    // a shield never heals the boss back up.
    while (b.shieldAt.length && b.hp <= b.shieldAt[0] * b.maxHp) b.shieldAt.shift();
    const next = b.shieldAt[0];
    if (next !== undefined && b.hp - damage <= next * b.maxHp) {
      b.shieldAt.shift();
      b.hp = Math.ceil(next * b.maxHp);
      b.shield = this.cfg.BOSS.shieldTime;
      b.queue = [];
      b.attackTimer = 0.7;
      this._emit('hit', { id: b.id, x: b.x, y: b.y + b.h / 2, z: b.z, enemy: 'boss', boss: true });
      this._emit('bossShield', { x: b.x, y: b.y + b.h / 2, z: b.z, duration: b.shield });
      return;
    }
    this._damageEnemy(b, damage);
  }

  /** Quake (ground wave: jump) or laser (chest-high beam: slide), from the boss towards the player. */
  _spawnWave(kind, z) {
    const c = this.cfg.BOSS[kind];
    this.waves.push({ id: this.nextId++, kind, z, speed: c.speed, y0: c.y0, y1: c.y1, charge: c.charge ?? 0, hit: false, dead: false });
    this._emit('bossWave', { kind, z, charge: c.charge ?? 0 });
  }

  _updateWaves(dt) {
    if (!this.waves.length) return;
    const box = this.playerBox();
    for (const wv of this.waves) {
      if (wv.charge > 0) {
        wv.charge -= dt;
        continue;
      }
      const prev = wv.z;
      wv.z -= wv.speed * dt;
      // Swept: it may cross the runner within one long step.
      if (!wv.hit && prev >= box.z0 && wv.z <= box.z1 && box.y0 < wv.y1 && box.y1 > wv.y0) {
        wv.hit = true;
        this._damage(wv.kind);
        if (this.state !== 'running') return;
      }
      if (wv.z < this.cfg.WORLD.despawnZ) wv.dead = true;
    }
    this.waves = this.waves.filter((wv) => !wv.dead);
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
      case 'heavy': {
        // Heavy plasma on two lanes: shots cannot stop it, change lane.
        const free = this.rng.int(0, lanes - 1);
        for (let lane = 0; lane < lanes; lane++) if (lane !== free) this._enemyShot(laneX(lane), b.z - 1.5, 'boss', true);
        break;
      }
      case 'quake':
        this._spawnWave('quake', b.z - 1);
        break;
      case 'laser':
        this._spawnWave('laser', b.z - 1.5);
        break;
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
      if ((e.type === 'drone' || e.type === 'bomber' || e.type === 'sniper') && e.state !== 'approach') continue;
      if (e.type === 'charger' && e.state === 'windup') continue;
      if (e.type === 'charger' || e.type === 'car') e.prevZ = e.z; // for the swept collision below
      e.z -= dz;
      if (e.type === 'walker') e.z -= this.cfg.ENEMIES.walker.walk * dt;
      else if (e.type === 'guard') e.z -= this.cfg.ENEMIES.guard.walk * dt;
      else if (e.type === 'car') e.z -= this.cfg.ENEMIES.car.speed * dt;
      else if (e.type === 'charger' && e.state === 'charge') e.z -= this.cfg.ENEMIES.charger.charge * dt;
    }
    if (this.spawnPaused) return;

    const bossPhase = this.boss || (!this.zone.bossDone && this.zoneProgress >= this.bossAt - 60);
    this.distanceToNext -= dz;
    while (this.distanceToNext <= 0) {
      const z0 = WORLD.spawnZ + this.distanceToNext;
      const ev = this.event?.type;
      const quiet = bossPhase || this.zone.cooldown > 0 || ev === 'ambush' || ev === 'meteors' || ev === 'traffic' || this.mode === 'bossRush' || this.mode === 'assault';
      // Rows are laid out for the course speed: one spawned in turbo is
      // reached after it, at the normal speed.
      const speed = this.courseSpeed;
      const pattern =
        ev === 'goldRush'
          ? this.spawner.goldRush(speed)
          : quiet
            ? this.spawner.coinsOnly(speed)
            : this.spawner.next(this.level, speed, { lowGravity: ev === 'lowGravity', weights: this._rowWeights() });
      for (const item of pattern.items) this._addEntity(item, z0);
      // Time attack: a clock every few rows, in the gap after the row.
      if (this.timeLeft !== null && ++this.rowsSinceClock >= this.cfg.TIME_ATTACK.clockEvery) {
        this.rowsSinceClock = 0;
        this._addEntity({ type: 'clock', lane: this.courseRng.int(0, 2), dz: pattern.length + pattern.gapAfter / 2, y: 0.7 }, z0);
      }

      if (!bossPhase && !ev && this.courseTime >= this.nextPowerupAt) {
        const type = this._pickPowerup();
        this._addEntity({ type, lane: this.courseRng.int(0, 2), dz: pattern.length + pattern.gapAfter / 2, y: 0.5 }, z0);
        this.nextPowerupAt = this.courseTime + this.courseRng.range(...POWERUPS.spawnEvery) * (this.perks.lucky ? PERK_TUNING.luckyEvery : 1);
      }
      // In a storm the fog is close: rows come a bit further apart.
      this.distanceToNext += pattern.length + pattern.gapAfter * (ev === 'storm' || ev === 'blackout' ? this.cfg.EVENTS[ev].gap : 1);
    }
  }

  _activeDrones() {
    return this.entities.filter((e) => e.type === 'drone' && !e.dead).length;
  }


  _pickPowerup() {
    const p = this.player;
    const pool = ['magnet', 'rapid', 'double', 'rockets'];
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
      case 'fence': {
        const s = OBSTACLES.fence;
        e = { ...base, kind: 'obstacle', y: 0, w: s.w, h: s.h, d: s.d, on: true, zapped: false, phase: item.phase ?? this.rng.next() * (s.on + s.off) };
        break;
      }
      case 'sniper': {
        const s = ENEMIES.sniper;
        const hp = s.hp + Math.floor(this.zone.index / 2);
        e = { ...base, kind: 'enemy', y: s.y, w: s.w, h: s.h, d: s.d, hp, maxHp: hp, state: 'approach', holdZ: this.rng.range(...s.holdZ), timer: 0, shotsLeft: s.shots, aimLane: item.lane, phase: this.rng.next() * 6 };
        break;
      }
      case 'guard': {
        const s = ENEMIES.guard;
        const hp = s.hp + Math.floor(this.zone.index / 2);
        e = { ...base, kind: 'enemy', y: 0, w: s.w, h: s.h, d: s.d, hp, maxHp: hp, shieldHp: s.shield + this.zone.index, phase: this.rng.next() * 6 };
        break;
      }
      case 'car': {
        const s = ENEMIES.car;
        e = { ...base, kind: 'enemy', y: 0, w: s.w, h: s.h, d: s.d, hp: s.hp, maxHp: s.hp, phase: this.rng.next() * 6 };
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
      case 'turbo':
      case 'ramp': {
        // Pads on the road: driven over, never hit.
        const s = item.type === 'turbo' ? this.cfg.TURBO : this.cfg.RAMP;
        e = { ...base, kind: 'pad', y: 0, w: s.w, h: s.h, d: s.d, used: false };
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
    const k = this.playerScale;
    const h = (p.slide > 0 ? PLAYER.slideHeight : PLAYER.height) * k;
    const w = (PLAYER.width * k) / 2;
    const d = (PLAYER.depth * k) / 2;
    return { x0: p.x - w, x1: p.x + w, y0: p.y, y1: p.y + h, z0: -d, z1: d };
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

    // Vertical: gravity, ground, platform tops and ramp slopes.
    const prevY = p.y;
    // A jump started in low gravity stays floaty until it lands.
    if (this.lowGravity && !p.grounded) p.floaty = true;
    const floaty = this.lowGravity || p.floaty ? this.cfg.EVENTS.lowGravity.gravity : 1;
    p.vy -= PLAYER.gravity * floaty * dt;
    p.y += p.vy * dt;

    let surface = 0;
    let ramp = null;
    let passed = null; // the ramp we were on last step, now behind its lip
    let skimmed = null; // a ramp whose lip we fly just over (a jump on or right before it)
    const box = this.playerBox();
    for (const e of this.entities) {
      if (e.dead) continue;
      if (e.type === 'platform') {
        const top = e.y + e.h;
        const b = entityBox(e);
        if (box.x0 < b.x1 && box.x1 > b.x0 && box.z0 < b.z1 && box.z1 > b.z0 && prevY >= top - WORLD.landTolerance) {
          surface = Math.max(surface, top);
        }
      } else if (e.type === 'ramp' && !e.used && Math.abs(p.x - e.x) < (e.w + PLAYER.width) / 2 - 0.2) {
        // The slope rises from the foot (u = 0) to the lip (u = 1).
        const u = -(e.z - e.d / 2) / e.d;
        const top = e.h * u;
        // Once on the slope we stay on it, however long the step.
        if (u >= 0 && u <= 1 && (prevY >= top - 0.5 || e.id === p.rampId) && top >= surface) {
          surface = top;
          ramp = e;
        } else if (u > 1 && e.id === p.rampId) passed = e;
        // This step crossed the launch point, in the air not far above the slope.
        const prevU = u - (this.speed * dt) / e.d;
        if (u >= this.cfg.RAMP.at && prevU < this.cfg.RAMP.at && p.y > e.h * Math.min(1, u) && p.y < e.h + 2.3) skimmed = e;
      }
    }

    const wasGrounded = p.grounded;
    if (p.y <= surface) {
      const impact = p.vy;
      p.y = surface;
      p.vy = 0;
      p.grounded = true;
      p.floaty = false;
      if (!wasGrounded) {
        this._emit('land', { impact });
        if (p.bufferJump > 0) this._doJump();
        else if (p.bufferSlide > 0) this._doSlide();
      }
    } else if (p.y > surface + 0.01) {
      p.grounded = false;
    }
    p.surface = surface;
    // Near the lip of a ramp: launched into the air (also when a long step
    // at low frame rate jumped past the lip).
    if (ramp && p.grounded && -(ramp.z - ramp.d / 2) / ramp.d >= this.cfg.RAMP.at) this._launch(ramp);
    else if (passed && !passed.used && !ramp) this._launch(passed);
    else if (skimmed && !skimmed.used && !p.grounded) this._launch(skimmed);
    p.rampId = ramp && p.grounded ? ramp.id : null;
  }

  _launch(ramp) {
    const p = this.player;
    ramp.used = true;
    p.y = Math.max(p.y, ramp.h * this.cfg.RAMP.at);
    p.vy = Math.max(p.vy, this.cfg.RAMP.launch * (this.lowGravity?.jump ?? 1));
    p.floaty = !!this.lowGravity;
    p.grounded = false;
    p.slide = 0;
    p.bufferJump = 0;
    this.stats.ramps += 1;
    this._emit('ramp', { x: ramp.x, z: ramp.z });
    if (this.mode === 'parkour') this._trick('ramp');
  }

  /** Turbo pad: faster, untouchable, smashing through everything for a while. */
  _startTurbo(pad) {
    const p = this.player;
    pad.used = true;
    p.turbo = this.cfg.TURBO.duration;
    this.stats.turbos += 1;
    this._emit('turbo', { duration: p.turbo, x: pad.x, z: pad.z });
  }

  _turboSmash(e) {
    if (this.mode === 'parkour') {
      // No kills in parkour: smashing through is a trick.
      e.dead = true;
      this.stats.smashed += 1;
      this._emit('smash', { id: e.id, enemy: e.type, x: e.x, y: e.y + e.h / 2, z: e.z, turbo: true, points: 0 });
      this._trick('smash');
      return;
    }
    if (e.kind === 'enemy') {
      this.stats.smashed += 1;
      this._kill(e);
      return;
    }
    e.dead = true;
    const points = Math.round(this.cfg.TURBO.smashPoints * (this.player.double > 0 ? 2 : 1) * this.scoreMult);
    this.score.addBonus(points);
    this.stats.smashed += 1;
    this._gainOverdrive(this.cfg.OVERDRIVE.gain.smash);
    this._emit('smash', { id: e.id, enemy: e.type, x: e.x, y: e.y + e.h / 2, z: e.z, turbo: true, points });
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

  /** Homing rockets power-up: one rocket every so often, from alternating shoulders. */
  _updateRockets(dt) {
    const p = this.player;
    if (p.rockets <= 0) return;
    p.rocketTimer -= dt;
    if (p.rocketTimer > 0) return;
    const target = this._rocketTarget(p.x, 0);
    if (!target) return; // wait for something to shoot at
    const { ROCKETS } = this.cfg;
    p.rocketTimer = ROCKETS.every;
    p.rocketSide = -p.rocketSide;
    const x = p.x + 0.45 * p.rocketSide;
    const y = p.y + 1.65;
    this.shots.push({ id: this.nextId++, x, y, vy: 1.5, z: 0.2, vx: 0, damage: ROCKETS.damage, speed: ROCKETS.speed, pierce: false, hits: new Set(), rocket: true, target: target.id });
    this._emit('rocket', { x, y, side: p.rocketSide });
  }

  /** The closest enemy (or the boss) ahead of z, favoring the ones straight ahead. */
  _rocketTarget(x, z) {
    const { ROCKETS } = this.cfg;
    let best = null;
    let bestScore = Infinity;
    const consider = (e) => {
      if (!e || e.dead || e.leaving || e.state === 'leave' || e.z < z + 3 || e.z > ROCKETS.range) return;
      const score = e.z - z + Math.abs(e.x - x) * 4;
      if (score < bestScore) {
        best = e;
        bestScore = score;
      }
    };
    for (const e of this.entities) if (e.kind === 'enemy') consider(e);
    consider(this.boss);
    return best;
  }

  _steerRocket(s, dt) {
    let t = this.boss && this.boss.id === s.target ? this.boss : this.entities.find((e) => e.id === s.target);
    // Gone, flying away, or already behind the rocket: pick another one.
    if (!t || t.dead || t.leaving || t.state === 'leave' || t.z < s.z + 0.5) {
      t = this._rocketTarget(s.x, s.z);
      s.target = t?.id ?? null;
    }
    if (!t) return;
    // Aim where the target will be: it comes towards us at the road speed.
    const time = Math.max(0.05, (t.z - s.z) / (s.speed + this.speed));
    const k = Math.min(1, this.cfg.ROCKETS.steer * dt);
    s.vx += ((t.x - s.x) / time - s.vx) * k;
    s.vy += ((t.y + t.h / 2 - s.y) / time - s.vy) * k;
  }

  // ----------------------------------------------------------- enemies

  _enemyShot(x, z, source, heavy = false) {
    const { BULLETS, BOSS } = this.cfg;
    if (heavy) this.eshots.push({ id: this.nextId++, x, y: BOSS.heavy.y, z, r: BOSS.heavy.radius, speed: BOSS.heavy.speed, heavy: true, source });
    else this.eshots.push({ id: this.nextId++, x, y: BULLETS.enemyHeight, z, r: BULLETS.enemyRadius, source });
    this._emit('enemyShot', { x, z, source, heavy });
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
      } else if (e.type === 'sniper') {
        this._updateSniper(e, dt);
      } else if (e.type === 'fence') {
        const f = this.cfg.OBSTACLES.fence;
        e.on = (this.time + e.phase) % (f.on + f.off) < f.on;
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
    this._updateWaves(dt);
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

  /**
   * Sniper: holds far ahead, locks the player's lane with a red sight, then
   * fires a beam down that lane. A few shots, then it flies away.
   */
  _updateSniper(e, dt) {
    const s = this.cfg.ENEMIES.sniper;
    if (e.state === 'approach' && e.z <= e.holdZ) {
      e.state = 'cool';
      e.timer = 0.4;
    }
    if (e.state === 'cool') {
      e.timer -= dt;
      if (e.timer <= 0) {
        if (e.shotsLeft <= 0) {
          e.state = 'leave';
          return;
        }
        e.state = 'aim';
        e.timer = s.aim;
        e.aimLane = this.player.lane;
        this._emit('sniperAim', { id: e.id, lane: e.aimLane, x: e.x, y: e.y, z: e.z, duration: s.aim });
      }
    } else if (e.state === 'aim') {
      // It slides over to keep the sight steady from above the lane.
      const tx = laneX(e.aimLane);
      e.x += Math.max(-4 * dt, Math.min(4 * dt, tx - e.x));
      e.timer -= dt;
      if (e.timer <= 0) {
        const p = this.player;
        const hit = Math.abs(p.x - tx) < (this.cfg.LANES.width + this.cfg.PLAYER.width) / 2 - 0.55;
        e.shotsLeft -= 1;
        e.state = 'cool';
        e.timer = s.cool;
        this._emit('sniperShot', { id: e.id, lane: e.aimLane, x: tx, y: e.y, z: e.z, hit });
        if (hit) this._damage('sniper');
      }
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
      if (s.rocket) this._steerRocket(s, dt);
      s.z += s.speed * dt;
      s.x += s.vx * dt;
      if (s.rocket) {
        s.y = Math.max(0.3, s.y + s.vy * dt);
      } else if (s.vy) {
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
        // A guard's shield soaks up shots from the front (rockets come from above).
        if (e.type === 'guard' && e.shieldHp > 0 && !s.rocket) {
          e.shieldHp -= s.damage;
          s.dead = true;
          this._emit('shotBlocked', { x: s.x, y: s.y, z: Math.max(zMin, prevZ), guard: true });
          if (e.shieldHp <= 0) this._emit('guardShieldBreak', { id: e.id, x: e.x, y: e.y + e.h / 2, z: e.z });
          break;
        }
        if (e.kind === 'boss') {
          // A shield stops everything, piercing shots included.
          if (e.shield > 0) s.dead = true;
          this._damageBoss(e, s.damage, s.x, s.y, Math.max(zMin, prevZ));
        } else this._damageEnemy(e, s.damage);
        if (s.rocket) this._rocketBlast(s, e);
        if (!s.pierce) s.dead = true;
      }
      if (s.dead) continue;
      for (const b of this.eshots) {
        if (b.dead || b.heavy) continue; // heavy plasma soaks shots up
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
      b.z -= (b.speed ?? BULLETS.enemySpeed) * dt;
      if (b.z < this.cfg.WORLD.despawnZ) b.dead = true;
    }
  }

  /** A rocket's blast also hurts the enemies around the one it hit. */
  _rocketBlast(s, hit) {
    const r = this.cfg.ROCKETS.splash;
    this._emit('explosion', { x: s.x, y: s.y, z: hit.z, radius: r, rocket: true });
    for (const o of this.entities) {
      if (o.dead || o === hit || o.kind !== 'enemy') continue;
      if (Math.hypot(o.x - s.x, o.z - hit.z) < r) this._damageEnemy(o, 1);
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
    const points = Math.round((SCORE.kill[e.type] ?? 10) * c.count * mult * this.scoreMult);
    this.score.addBonus(points);
    this.stats.kills += e.type === 'crate' || e.type === 'mine' ? 0 : 1;
    if (e.type === 'drone') this.stats.drones += 1;
    if (e.type === 'walker') this.stats.walkers += 1;
    if (e.type === 'crate') this.stats.crates += 1;
    if (e.type === 'charger') this.stats.chargers += 1;
    if (e.type === 'turret') this.stats.turrets += 1;
    if (e.type === 'bomber') this.stats.bombers += 1;
    if (e.type === 'sniper') this.stats.snipers += 1;
    if (e.type === 'guard') this.stats.guards += 1;
    if (e.type === 'car') this.stats.cars += 1;
    this._gainOverdrive(this.cfg.OVERDRIVE.gain.kill);
    this._addTime(this.cfg.TIME_ATTACK.kill, 'kill');
    this._emit('kill', { id: e.id, enemy: e.type, x: e.x, y: e.y + e.h / 2, z: e.z, points, combo: c.count });
    if (c.count >= 2) this._emit('combo', { count: c.count });

    // Loot: a few coins (and sometimes a gem) pop out.
    const coins = { drone: 3, bomber: 3, turret: 3, sniper: 3, guard: 4, mine: 0 }[e.type] ?? 2;
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
    this._nearMisses();

    for (const e of this.entities) {
      if (e.dead || e.kind === 'pickup' || e.kind === 'hazard') continue;
      const b = entityBox(e);
      // A charging ram moves ~3 m per step at low frame rates: sweep its box
      // back to where it was, so it cannot jump through the player.
      if ((e.type === 'charger' || e.type === 'car') && e.prevZ !== undefined) b.z1 = Math.max(b.z1, e.prevZ + e.d / 2);
      if (!overlaps(box, b)) continue;
      if (e.kind === 'pad') {
        if (e.type === 'turbo' && !e.used) this._startTurbo(e);
        continue;
      }
      if (p.turbo > 0) {
        // Turbo: skims over holes, runs on platforms, smashes the rest.
        if (e.type === 'gap' || (e.type === 'platform' && p.y >= e.y + e.h - tol)) continue;
        this._turboSmash(e);
        continue;
      }
      if (e.type === 'fence') {
        // A laser fence only hurts while it is on (a heart, not the run).
        if (e.on && !e.zapped) {
          e.zapped = true;
          this._emit('fenceZap', { id: e.id, x: e.x, z: e.z });
          this._damage('fence');
        }
      } else if (e.type === 'platform') {
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
        if (p.turbo > 0) {
          this._emit('plasmaDestroyed', { x: s.x, y: s.y, z: s.z });
          continue;
        }
        this._damage('plasma');
        if (this.state !== 'running') return;
      }
    }
  }

  /** Something dangerous just went by in the lane the player left a moment ago. */
  _nearMisses() {
    const p = this.player;
    const { NEAR_MISS, PLAYER } = this.cfg;
    const recent = this.time - p.laneChangedAt < NEAR_MISS.window && p.fromLane !== p.lane;
    const parkour = this.mode === 'parkour';
    for (const e of this.entities) {
      if (e.dead || e.passed || e.z + e.d / 2 > -PLAYER.depth / 2) continue;
      e.passed = true;
      if (parkour) this._trickOver(e);
      if (!recent || !NEAR_MISS_TYPES.has(e.type) || (e.type === 'fence' && !e.on)) continue;
      if (Math.abs(e.x - laneX(p.fromLane)) > 0.6 || Math.abs(e.x - p.x) < e.w / 2 + PLAYER.width / 2) continue;
      const points = Math.round(NEAR_MISS.points * this.scoreMult);
      this.score.addBonus(points);
      this.stats.nearMisses += 1;
      this._gainOverdrive(this.cfg.OVERDRIVE.gain.nearMiss);
      this._addTime(this.cfg.TIME_ATTACK.nearMiss, 'nearMiss');
      this._emit('nearMiss', { x: e.x, y: e.y + e.h / 2, z: e.z, points });
      if (parkour) this._trick('close');
    }
  }

  /** Hitting an obstacle: lethal unless shielded or invulnerable. */
  _crash(e) {
    const p = this.player;
    if (p.invulnerable > 0 || p.turbo > 0 || this.safe) return;
    if (p.shield) {
      p.shield = false;
      p.invulnerable = this.cfg.POWERUPS.shieldGrace;
      e.dead = true;
      this._emit('shieldBreak', { x: e.x, y: 1, z: e.z });
      return;
    }
    this.stats.hits += 1; // a crash costs the "no heart lost" star too
    this._die(e.type);
  }

  /** Enemy contact or plasma: costs one heart. */
  _damage(cause) {
    const p = this.player;
    if (p.invulnerable > 0 || p.turbo > 0 || this.safe) return;
    if (p.shield) {
      p.shield = false;
      p.invulnerable = this.cfg.POWERUPS.shieldGrace;
      this._emit('shieldBreak', { x: p.x, y: 1, z: 0 });
      return;
    }
    p.hp -= 1;
    this.stats.hits += 1;
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
    // Double points, storm and daily multipliers also count for coins and gems.
    const points = (p.double > 0 ? 2 : 1) * this.scoreMult;
    const lucky = this.perks.lucky ? PERK_TUNING.luckyDuration : 1;
    switch (e.type) {
      case 'coin': {
        // "Coins" perk: a chance per level that the coin counts double.
        const extra = this.perks.coins && this.rng.chance(0.5 * this.perks.coins) ? 1 : 0;
        this.score.addCoin(1 + extra);
        this._gainOverdrive(this.cfg.OVERDRIVE.gain.coin);
        if (points > 1) this.score.addBonus(Math.round(this.cfg.SCORE.coin * (points - 1)));
        break;
      }
      case 'gem':
        this.score.addGem(1);
        if (points > 1) this.score.addBonus(Math.round(this.cfg.SCORE.gem * (points - 1)));
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
      case 'rockets':
        p.rockets = POWERUPS.rockets * lucky;
        p.rocketTimer = 0;
        break;
      case 'clock':
        this.stats.clocks += 1;
        this._addTime(this.cfg.TIME_ATTACK.clock, 'clock');
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
    // Turbo: the speed eases in fast and out slowly; a short grace after it.
    const { TURBO } = this.cfg;
    if (p.turbo > 0) {
      p.turbo = Math.max(0, p.turbo - dt);
      if (p.turbo === 0) {
        p.invulnerable = Math.max(p.invulnerable, TURBO.grace);
        this._emit('turboEnd', {});
      }
    }
    const goal = p.turbo > 0 ? 1 : 0;
    const rate = (goal ? TURBO.rampUp : TURBO.rampDown) * dt;
    p.turboK += Math.max(-rate, Math.min(rate, goal - p.turboK));
    for (const k of ['magnet', 'rapid', 'double', 'rockets']) {
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
    // A campaign boss that got away cannot be brought back.
    // Hardcore: no second chance.
    return this.state === 'dead' && !this.reviveUsed && this.deathCause !== 'bossFled' && this.mode !== 'hardcore';
  }

  /** Second chance (rewarded ad): full health, nearby threats cleared, short invulnerability. */
  revive() {
    if (!this.canRevive) return false;
    const p = this.player;
    this.reviveUsed = true;
    this.entities = this.entities.filter((e) => e.kind === 'pickup' || e.z > 45);
    this.eshots = [];
    this.shots = [];
    this.waves = [];
    p.hp = this.maxHp;
    p.y = 0;
    p.vy = 0;
    p.grounded = true;
    p.slide = 0;
    p.jetpack = 0;
    p.turbo = 0;
    p.turboK = 0;
    p.invulnerable = this.cfg.POWERUPS.reviveGrace;
    if (this.timeLeft !== null) this.timeLeft = Math.max(this.timeLeft, this.cfg.TIME_ATTACK.reviveTime);
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
      boss: b ? { hp: Math.max(0, b.hp), maxHp: b.maxHp, leaving: b.leaving, kind: b.bossKind, shield: b.shield > 0, enraged: b.enraged } : null,
      fireReady: p.fireCooldown <= 0,
      jetpack: p.jetpack,
      rockets: p.rockets,
      turbo: p.turbo,
      od: p.od,
      overdrive: p.overdrive,
      timeLeft: this.timeLeft,
      goal: this.campaign ? { type: this.campaign.goal.type, value: this.campaign.goal.value, progress: Math.min(this.campaign.goal.value, this.goalProgress) } : null,
      event: this.event ? { type: this.event.type, left: Math.max(0, this.event.duration - this.event.t), duration: this.event.duration } : null,
      perks: { ...this.perks },
      mode: this.mode,
      wave: this.assault ? { n: this.assault.wave, state: this.assault.state, total: this.assault.total, left: this.assault.state === 'wave' ? this.assault.groups.reduce((n, g) => n + g.length, 0) + this.assault.spawned.filter((e) => !e.dead && e.z + e.d / 2 > this.cfg.WORLD.despawnZ).length : 0, boss: this.assault.state === 'boss' } : null,
      mutator: this.mutator ? { id: this.mutator.id, left: Math.max(0, this.mutator.duration - this.mutator.t), duration: this.mutator.duration } : null,
      chaosMult: this.chaos?.mult ?? 1,
      scale: this.playerScale,
    };
  }
}
