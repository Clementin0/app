/**
 * Campaign: 24 levels, four per zone. Each level has a goal, an optional
 * twist (modifiers of the run) and three stars:
 *   1. complete the goal;
 *   2. collect at least `starCoins` coins on the way (coin levels: be
 *      done within `starTime` seconds instead);
 *   3. complete it without losing a heart.
 *
 * Goal types: distance (m), coins, kills, boss (defeat the zone boss),
 * events (clear the forced run event), nearMisses, smashed (in turbo),
 * ramps. `weights` multiplies the chance of some rows, so every level
 * plays differently.
 */
export const CAMPAIGN = Object.freeze([
  // Città Neon
  { id: 1, zone: 0, goal: { type: 'distance', value: 500 }, starCoins: 40 },
  { id: 2, zone: 0, goal: { type: 'kills', value: 8 }, starCoins: 40, weights: { walkers: 5 } },
  { id: 3, zone: 0, goal: { type: 'distance', value: 700 }, starCoins: 55, twist: 'noShoot', modifiers: { noShoot: true } },
  { id: 4, zone: 0, goal: { type: 'boss', value: 1 }, starCoins: 30, modifiers: { bossAt: 350 } },
  // Deserto
  { id: 5, zone: 1, goal: { type: 'coins', value: 110 }, starTime: 40, twist: 'goldRush', modifiers: { event: 'goldRush' } },
  { id: 6, zone: 1, goal: { type: 'nearMisses', value: 5 }, starCoins: 60, weights: { wallGate: 3, slalom: 3, barrierRow: 2 } },
  { id: 7, zone: 1, goal: { type: 'distance', value: 900 }, starCoins: 80, twist: 'oneHeart', modifiers: { hp: 1 } },
  { id: 8, zone: 1, goal: { type: 'boss', value: 1 }, starCoins: 35, modifiers: { bossAt: 400 } },
  // Griglia di ghiaccio
  { id: 9, zone: 2, goal: { type: 'kills', value: 15 }, starCoins: 70, weights: { walkers: 3, droneWave: 3, ram: 2 } },
  { id: 10, zone: 2, goal: { type: 'events', value: 1 }, starCoins: 50, twist: 'traffic', modifiers: { event: 'traffic' } },
  { id: 11, zone: 2, goal: { type: 'distance', value: 1000 }, starCoins: 90, twist: 'fast', modifiers: { speed: 1.2 } },
  { id: 12, zone: 2, goal: { type: 'boss', value: 1 }, starCoins: 40, modifiers: { bossAt: 400 } },
  // Inferno
  { id: 13, zone: 3, goal: { type: 'smashed', value: 10 }, starCoins: 70, weights: { turboStrip: 6 } },
  { id: 14, zone: 3, goal: { type: 'events', value: 1 }, starCoins: 50, twist: 'blackout', modifiers: { event: 'blackout' } },
  { id: 15, zone: 3, goal: { type: 'kills', value: 22 }, starCoins: 80, twist: 'spread', modifiers: { weapon: 'spread' }, weights: { walkers: 3, droneWave: 2, ambush: 2 } },
  { id: 16, zone: 3, goal: { type: 'boss', value: 1 }, starCoins: 45, modifiers: { bossAt: 450 } },
  // Abisso
  { id: 17, zone: 4, goal: { type: 'coins', value: 130 }, starTime: 70, twist: 'lowGravity', modifiers: { event: 'lowGravity' } },
  { id: 18, zone: 4, goal: { type: 'nearMisses', value: 6 }, starCoins: 80, weights: { laserFences: 4, wallGate: 2, slalom: 2 } },
  // Pure runner: no shooting, so the rows are mostly obstacles to dodge.
  {
    id: 19,
    zone: 4,
    goal: { type: 'distance', value: 800 },
    starCoins: 80,
    twist: 'pureRunner',
    modifiers: { hp: 2, noShoot: true, event: 'goldRush' },
    weights: { wallGate: 3, slalom: 3, barrierRow: 3, beamRow: 3, chasm: 2, mixedRow: 2, laserFences: 2, droneWave: 0, turretNest: 0, bomberRun: 0, sniperNest: 0, ambush: 0, guardPost: 0, ram: 0.3, walkers: 0.3 },
  },
  { id: 20, zone: 4, goal: { type: 'boss', value: 1 }, starCoins: 50, modifiers: { bossAt: 450 } },
  // Orbita
  { id: 21, zone: 5, goal: { type: 'kills', value: 14 }, starCoins: 90, weights: { droneWave: 3, walkers: 3, sniperNest: 2 } },
  { id: 22, zone: 5, goal: { type: 'ramps', value: 5 }, starCoins: 90, weights: { rampJump: 6 } },
  { id: 23, zone: 5, goal: { type: 'distance', value: 1400 }, starCoins: 120, twist: 'fastFragile', modifiers: { speed: 1.25, hp: 2 } },
  { id: 24, zone: 5, goal: { type: 'boss', value: 1 }, starCoins: 60, modifiers: { bossAt: 500 } },
]);

export const getLevel = (id) => CAMPAIGN.find((l) => l.id === id) ?? null;

/** Coins for the first clear of a level; each new star is worth a gem. */
export const levelReward = (level) => ({ coins: 60 + level.id * 15, gems: 0 });
export const STAR_GEMS = 1;

/** Progress value of a goal in a world (LaneWorld). */
export function goalProgress(goal, world) {
  switch (goal.type) {
    case 'distance':
      return Math.floor(world.distance);
    case 'coins':
      return world.score.coins;
    case 'kills':
      return world.stats.kills;
    case 'boss':
      return world.stats.bosses;
    case 'events':
      return world.stats.events;
    case 'nearMisses':
      return world.stats.nearMisses;
    case 'smashed':
      return world.stats.smashed;
    case 'ramps':
      return world.stats.ramps;
    default:
      return 0;
  }
}

/** Stars earned by a finished level run: [complete, coins (or time), no hit]. */
export function starsFor(level, { won, coins, hits, time = Infinity }) {
  const second = level.starTime ? time <= level.starTime : coins >= level.starCoins;
  return [won, won && second, won && hits === 0];
}
