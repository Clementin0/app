/**
 * Tuning of the 3D lane runner. World units are meters: x = lateral,
 * y = up, z = forward. The player stays at z = 0 and the world scrolls
 * towards negative z.
 */

export const LANES = Object.freeze({
  count: 3,
  width: 2.4, // distance between lane centers
});

export const laneX = (lane) => (lane - (LANES.count - 1) / 2) * LANES.width;

export const PLAYER = Object.freeze({
  width: 0.9,
  height: 1.7,
  slideHeight: 0.8,
  depth: 0.9,
  laneSwitchTime: 0.13,
  jumpVelocity: 11.5, // apex ~1.95 m, airtime ~0.68 s
  gravity: 34,
  slamVelocity: -24, // swipe down while airborne
  slideTime: 0.62,
  baseHp: 3,
  hitGrace: 1.1, // invulnerability after losing a heart
  inputBuffer: 0.15, // a jump/slide asked slightly too early is remembered
});

export const SPEED = Object.freeze({
  start: 15,
  max: 34,
  rampTime: 120,
});

export const WORLD = Object.freeze({
  spawnZ: 115, // new rows appear here
  despawnZ: -14,
  maxStep: 1 / 20,
  landTolerance: 0.25,
});

/** Player weapons. Upgrades scale damage and fire rate. */
export const WEAPONS_STATS = Object.freeze({
  blaster: { interval: 0.22, damage: 1, speed: 70, pattern: 'single' },
  twin: { interval: 0.26, damage: 1, speed: 70, pattern: 'twin' },
  spread: { interval: 0.3, damage: 1, speed: 65, pattern: 'spread' },
  laser: { interval: 0.17, damage: 1, speed: 120, pattern: 'single', pierce: true },
});

export const BULLETS = Object.freeze({
  range: 75, // player shots vanish after this distance
  height: 1.1, // shots fly at chest height
  enemySpeed: 19, // enemy plasma speed relative to the player
  enemyHeight: 1.25, // above a sliding player, at head height when standing
  enemyRadius: 0.32,
});

export const ENEMIES = Object.freeze({
  walker: { w: 1.2, h: 1.8, d: 1.0, hp: 3, walk: 4 },
  drone: { w: 1.2, h: 1.0, d: 1.0, hp: 2, y: 0.85, holdZ: [20, 30], stay: [6, 9], fireEvery: [1.4, 2.1], hop: [1.4, 2.4] },
  crate: { w: 1.4, h: 1.2, d: 1.4, hp: 2 },
  mine: { w: 0.9, h: 0.7, d: 0.9, hp: 1 }, // dropped by bosses and bombers: shoot it or jump it
  // Ram: stops ahead, flashes, then charges down its lane.
  charger: { w: 1.3, h: 1.3, d: 1.4, hp: 4, windupZ: [24, 32], windup: 0.75, charge: 24 },
  // Turret on the road: fires plasma down its lane while in range.
  turret: { w: 1.2, h: 1.4, d: 1.2, hp: 3, fireEvery: 1.35, range: [12, 50] },
  // Bomber: flies ahead of the player, changes lane and drops mines.
  bomber: { w: 1.5, h: 0.9, y: 1.0, d: 1.2, hp: 3, holdZ: [26, 32], stay: [7, 10], dropEvery: [1.6, 2.4], hop: [1.8, 2.8] },
});

export const OBSTACLES = Object.freeze({
  barrier: { w: 2.0, h: 0.9, d: 0.6 }, // jump over
  beam: { w: 2.2, y: 1.05, h: 0.6, d: 0.5 }, // slide under
  wall: { w: 2.0, h: 3.2, d: 1.0 }, // change lane
  platform: { w: 2.0, h: 1.4 }, // jump on top and run, d varies
  slider: { w: 2.0, h: 0.9, d: 0.6, period: 2.6 }, // barrier gliding across the lanes: jump it or dodge it
  gap: { w: 2.3, y: -1, h: 1.05, d: 4 }, // hole in the road: jump it (a fall is fatal)
});

export const BOSS = Object.freeze({
  w: 5.2,
  h: 2.4,
  y: 0.9,
  z: 34,
  baseHp: 34,
  hpPerZone: 16,
  attackEvery: 1.7,
  attackSpeedup: 0.1, // per zone
  timeLimit: 45,
});

/**
 * One boss per zone (cycling): each has its own colors and attack cycle.
 * volley: plasma on two lanes, one free / burst: 3 aimed shots /
 * sweep: shots lane after lane / mines: mines on 1-2 lanes / drones: 2 drones.
 */
export const BOSS_KINDS = Object.freeze([
  { id: 'mothership', nameKey: 'bossMothership', patterns: ['volley', 'burst', 'volley'], hull: 0x2b2347, ring: 0xff2bd6, dome: 0x7ff3ff, core: 0xff2bd6 },
  { id: 'scorpion', nameKey: 'bossScorpion', patterns: ['mines', 'volley', 'burst', 'mines', 'volley'], hull: 0x3d2410, ring: 0xff8a3d, dome: 0xffd23f, core: 0xff6a00 },
  { id: 'carrier', nameKey: 'bossCarrier', patterns: ['drones', 'sweep', 'volley', 'burst'], hull: 0x173452, ring: 0x7ff3ff, dome: 0xe0f8ff, core: 0x3fd0ff },
  { id: 'overlord', nameKey: 'bossOverlord', patterns: ['sweep', 'mines', 'burst', 'drones', 'volley'], hull: 0x3a0d14, ring: 0xff3860, dome: 0xffb3c1, core: 0xff2b2b },
  { id: 'kraken', nameKey: 'bossKraken', patterns: ['sweep', 'mines', 'volley', 'sweep', 'burst'], hull: 0x0c3a3a, ring: 0x39ffd2, dome: 0xb8fff0, core: 0x00ffa8 },
  { id: 'core', nameKey: 'bossCore', patterns: ['meteors', 'drones', 'sweep', 'burst', 'mines', 'volley'], hull: 0x1e1440, ring: 0xd6c8ff, dome: 0xffffff, core: 0x9d4dff },
]);

export const bossKind = (zoneIndex) => BOSS_KINDS[zoneIndex % BOSS_KINDS.length];

export const ZONES = Object.freeze({
  bossAt: 900, // meters into a zone when the boss arrives
  eventsAt: [280, 600], // meters into a zone when a run event can start
});

/**
 * Run events between bosses, so no two stretches of road feel the same.
 * minZone: first zone (0-based) where it can happen.
 */
export const EVENTS = Object.freeze({
  goldRush: { minZone: 0, duration: 7, speed: 1.15 },
  ambush: { minZone: 0, duration: 18, speed: 0.72, waves: 3, waveEvery: 4.2, reward: 30 },
  meteors: { minZone: 1, duration: 9, every: 0.8, fuse: 1.5, radius: 1.7 },
});

/** Falling meteor: a marker on the road, then an impact on that lane. */
export const METEOR = Object.freeze({ w: 2.0, h: 3, d: 3.4, fallHeight: 22 });

/** Jetpack power-up: fly over everything for a while, collecting sky coins. */
export const JETPACK = Object.freeze({ duration: 7, height: 4.3, rise: 9, landingGrace: 1.2 });

export const SCORE = Object.freeze({
  coin: 10,
  gem: 50,
  kill: { walker: 30, drone: 50, crate: 10, mine: 15, charger: 40, turret: 35, bomber: 55, boss: 500 },
  comboWindow: 2.6,
  comboMax: 8,
});

export const POWERUPS = Object.freeze({
  magnet: 8,
  rapid: 7,
  double: 10,
  magnetRadius: 13,
  shieldGrace: 1.0,
  reviveGrace: 3.0,
  spawnEvery: [14, 24],
});

export const GAME3D = Object.freeze({ LANES, PLAYER, SPEED, WORLD, WEAPONS_STATS, BULLETS, ENEMIES, OBSTACLES, BOSS, BOSS_KINDS, ZONES, EVENTS, METEOR, JETPACK, SCORE, POWERUPS });
