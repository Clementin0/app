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
});

export const OBSTACLES = Object.freeze({
  barrier: { w: 2.0, h: 0.9, d: 0.6 }, // jump over
  beam: { w: 2.2, y: 1.05, h: 0.6, d: 0.5 }, // slide under
  wall: { w: 2.0, h: 3.2, d: 1.0 }, // change lane
  platform: { w: 2.0, h: 1.4 }, // jump on top and run, d varies
});

export const BOSS = Object.freeze({
  w: 5.2,
  h: 2.4,
  y: 0.9,
  z: 34,
  baseHp: 34,
  hpPerZone: 16,
  attackEvery: 1.7,
  attackSpeedup: 0.12, // per zone
  timeLimit: 45,
});

export const ZONES = Object.freeze({
  bossAt: 700, // meters into a zone when the boss arrives
});

export const SCORE = Object.freeze({
  coin: 10,
  gem: 50,
  kill: { walker: 30, drone: 50, crate: 10, boss: 500 },
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

export const GAME3D = Object.freeze({ LANES, PLAYER, SPEED, WORLD, WEAPONS_STATS, BULLETS, ENEMIES, OBSTACLES, BOSS, ZONES, SCORE, POWERUPS });
