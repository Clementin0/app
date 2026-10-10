import { GAME3D } from '../config/game3d.config.js';

/**
 * Obstacle / enemy patterns for the 3-lane runner. A pattern lists items
 * relative to its start: { type, lane, dz, y?, length? } where dz grows
 * away from the player. Every pattern leaves at least one way through
 * (a free lane, a jumpable barrier, a slideable beam or a shootable enemy),
 * and the free distance after a pattern scales with speed so there is
 * always time to react and switch lanes.
 */

const COIN_SPACING = 2.4;

export function coinLine(lane, dz0, n, y = 0.5) {
  return Array.from({ length: n }, (_, i) => ({ type: 'coin', lane, dz: dz0 + i * COIN_SPACING, y }));
}

/** Coins following a jump over something at dzCenter. */
export function coinArc(lane, dzCenter, speed, n = 5) {
  const half = Math.min(7, speed * 0.3);
  return Array.from({ length: n }, (_, i) => {
    const u = -1 + (2 * i) / (n - 1);
    return { type: 'coin', lane, dz: dzCenter + u * half, y: 0.5 + 1.5 * (1 - u * u) };
  });
}

const otherLanes = (lanes) => [0, 1, 2].filter((l) => !lanes.includes(l));

/** Fisher-Yates shuffle of the three lanes (deterministic with the seeded rng). */
function shuffledLanes(rng) {
  const a = [0, 1, 2];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** One random lane, or two distinct random lanes. */
const someLanes = (rng, two) => (two ? shuffledLanes(rng).slice(0, 2) : [rng.int(0, 2)]);

export const PATTERNS3D = [
  {
    key: 'coinLine',
    minLevel: 0,
    weight: (l) => Math.max(1, 3 - l * 0.3),
    build: ({ rng }) => ({ length: 7 * COIN_SPACING, items: coinLine(rng.int(0, 2), 0, 8) }),
  },
  {
    key: 'barrierRow',
    minLevel: 0,
    weight: () => 3,
    build: ({ rng, speed, level }) => {
      const lanes = someLanes(rng, rng.chance(0.5));
      const items = lanes.map((lane) => ({ type: 'barrier', lane, dz: 0 }));
      items.push(...coinArc(lanes[0], 0, speed));
      const free = otherLanes(lanes);
      if (free.length && level >= 2 && rng.chance(0.35)) items.push({ type: 'walker', lane: rng.pick(free), dz: 10 });
      else if (free.length) items.push(...coinLine(rng.pick(free), -2, 4));
      return { length: 1, items };
    },
  },
  {
    key: 'beamRow',
    minLevel: 0,
    weight: () => 2.5,
    build: ({ rng }) => {
      const lanes = someLanes(rng, rng.chance(0.5));
      const items = lanes.map((lane) => ({ type: 'beam', lane, dz: 0 }));
      items.push(...coinLine(lanes[0], -1.2, 2, 0.1));
      return { length: 1, items };
    },
  },
  {
    key: 'wallGate',
    minLevel: 0,
    weight: () => 2.5,
    build: ({ rng, level }) => {
      const open = rng.int(0, 2);
      const items = otherLanes([open]).map((lane) => ({ type: 'wall', lane, dz: 0 }));
      // From level 2 the open lane can be guarded: shoot (or jump) the guard.
      if (level >= 2 && rng.chance(0.4)) items.push({ type: rng.chance(0.5) ? 'crate' : 'walker', lane: open, dz: 8 });
      else items.push(...coinLine(open, -3, 5));
      return { length: 1, items };
    },
  },
  {
    key: 'crates',
    minLevel: 0,
    weight: () => 2,
    build: ({ rng }) => {
      const lanes = someLanes(rng, rng.chance(0.4));
      const items = lanes.map((lane) => ({ type: 'crate', lane, dz: 0 }));
      items.push(...coinLine(lanes[0], 3, 3));
      return { length: 2, items };
    },
  },
  {
    key: 'walkers',
    minLevel: 0,
    weight: (l) => 2.2 + l * 0.2,
    build: ({ rng, level }) => {
      const lanes = someLanes(rng, level >= 3 && rng.chance(0.5));
      return { length: 2, items: lanes.map((lane, i) => ({ type: 'walker', lane, dz: i * 6 })) };
    },
  },
  {
    key: 'droneWave',
    minLevel: 1,
    weight: (l) => 2 + l * 0.2,
    allowed: ({ level, drones }) => drones < (level >= 4 ? 2 : 1),
    build: ({ rng, level, drones }) => {
      const n = level >= 4 && drones === 0 && rng.chance(0.5) ? 2 : 1;
      const lanes = shuffledLanes(rng).slice(0, n);
      const items = lanes.map((lane, i) => ({ type: 'drone', lane, dz: i * 5 }));
      items.push(...coinLine(otherLanes(lanes)[0] ?? 1, 0, 5));
      return { length: 8, items };
    },
  },
  {
    key: 'slalom',
    minLevel: 2,
    weight: () => 1.4,
    build: ({ rng, speed }) => {
      const spacing = speed * 0.8 + 3;
      const start = rng.int(0, 2);
      const step = start === 0 ? 1 : start === 2 ? -1 : rng.pick([-1, 1]);
      const free = [start, start + step, start + step * 2].map((l) => Math.max(0, Math.min(2, l)));
      const items = [];
      free.forEach((open, row) => {
        for (const lane of otherLanes([open])) items.push({ type: 'wall', lane, dz: row * spacing });
        items.push(...coinLine(open, row * spacing - 2, 2));
      });
      return { length: spacing * 2 + 1, items };
    },
  },
  {
    key: 'platformRun',
    minLevel: 2,
    weight: () => 1.5,
    build: ({ rng }) => {
      const length = rng.pick([12, 16, 20]);
      const lane = rng.int(0, 2);
      const items = [{ type: 'platform', lane, dz: 0, length }];
      items.push(...coinLine(lane, 2, Math.floor((length - 3) / COIN_SPACING), 1.75));
      const others = otherLanes([lane]);
      items.push({ type: 'barrier', lane: others[0], dz: 4 });
      items.push(...coinLine(others[1], 0, 4));
      return { length, items };
    },
  },
  {
    key: 'mixedRow',
    minLevel: 2,
    weight: () => 1.8,
    build: ({ rng }) => {
      const kinds = ['barrier', 'beam', 'wall'];
      return { length: 1, items: shuffledLanes(rng).map((lane, i) => ({ type: kinds[i], lane, dz: 0 })) };
    },
  },
  {
    key: 'jumpThenSlide',
    minLevel: 3,
    weight: () => 1.2,
    build: ({ speed }) => {
      const gap = speed * 1.05 + 2;
      const items = [];
      for (let lane = 0; lane < 3; lane++) items.push({ type: 'barrier', lane, dz: 0 }, { type: 'beam', lane, dz: gap });
      return { length: gap + 1, items };
    },
  },
  {
    // A barrier gliding from side to side: jump it, or slip past it.
    key: 'sliders',
    minLevel: 1,
    weight: () => 1.6,
    build: ({ rng, level, speed }) => {
      // A second one comes after a full jump (land, then jump again).
      const second = speed * 1.0 + 3;
      const items = [{ type: 'slider', lane: 1, dz: 0 }];
      const two = level >= 4 && rng.chance(0.5);
      if (two) items.push({ type: 'slider', lane: 1, dz: second });
      items.push(...coinLine(rng.int(0, 2), -6, 3));
      return { length: two ? second + 1 : 1, items };
    },
  },
  {
    // Holes in one or two lanes: jump over them (coins show the arc).
    key: 'chasm',
    minLevel: 1,
    weight: () => 1.8,
    build: ({ rng, speed }) => {
      const lanes = someLanes(rng, rng.chance(0.5));
      const items = lanes.map((lane) => ({ type: 'gap', lane, dz: 0 }));
      items.push(...coinArc(lanes[0], 0, speed));
      return { length: 4, items };
    },
  },
  {
    // The whole road falls away: jump!
    key: 'chasmAll',
    minLevel: 3,
    weight: () => 1,
    build: ({ rng, speed }) => {
      const items = [0, 1, 2].map((lane) => ({ type: 'gap', lane, dz: 0 }));
      items.push(...coinArc(rng.int(0, 2), 0, speed));
      return { length: 4, items };
    },
  },
  {
    // A ram stops ahead, flashes and charges down its lane: shoot it or move.
    key: 'ram',
    minLevel: 2,
    weight: (l) => 1.3 + l * 0.1,
    build: ({ rng, level }) => {
      const lanes = someLanes(rng, level >= 5 && rng.chance(0.4));
      const items = lanes.map((lane, i) => ({ type: 'charger', lane, dz: i * 7 }));
      items.push(...coinLine(otherLanes(lanes)[0] ?? 1, 0, 4));
      return { length: 3, items };
    },
  },
  {
    // A turret shooting down its lane, guarded by a crate.
    key: 'turretNest',
    minLevel: 3,
    weight: () => 1.3,
    build: ({ rng }) => {
      const [a, b, c] = shuffledLanes(rng);
      return {
        length: 3,
        items: [{ type: 'turret', lane: a, dz: 6 }, { type: 'crate', lane: b, dz: 0 }, ...coinLine(c, 0, 4)],
      };
    },
  },
  {
    // A bomber hovering ahead, dropping mines on the lanes.
    key: 'bomberRun',
    minLevel: 4,
    weight: () => 1.1,
    allowed: ({ drones }) => drones < 2,
    build: ({ rng }) => ({ length: 8, items: [{ type: 'bomber', lane: rng.int(0, 2), dz: 0 }, ...coinLine(rng.int(0, 2), 4, 4)] }),
  },
  {
    key: 'ambush',
    minLevel: 4,
    weight: () => 1.3,
    build: ({ rng }) => {
      const [a, b, c] = shuffledLanes(rng);
      return {
        length: 3,
        items: [
          { type: 'walker', lane: a, dz: 2 },
          { type: 'crate', lane: b, dz: 0 },
          { type: 'beam', lane: c, dz: 0 },
        ],
      };
    },
  },
];

export class LaneSpawner {
  constructor(rng, config = GAME3D) {
    this.rng = rng;
    this.config = config;
    this.reset();
  }

  reset() {
    this.history = [];
    this.count = 0;
  }

  gapRange(speed, level) {
    const min = speed * 0.72 + 4;
    return { min, max: min + Math.max(4, 18 - level * 1.6) };
  }

  _finish(key, built, speed, level) {
    this.history.push(key);
    if (this.history.length > 6) this.history.shift();
    this.count += 1;
    const gap = this.gapRange(speed, level);
    return { key, length: built.length, items: built.items, gapAfter: this.rng.range(gap.min, gap.max) };
  }

  /** Gold rush event: coins on every lane, a gem now and then, tiny gaps. */
  goldRush(speed) {
    const items = [0, 1, 2].flatMap((lane) => coinLine(lane, 0, 7, lane === 1 ? 0.5 : 0.9));
    if (this.rng.chance(0.5)) items.push({ type: 'gem', lane: this.rng.int(0, 2), dz: 8, y: 1.6 });
    const pattern = this._finish('goldRush', { length: 6 * COIN_SPACING, items }, speed, 0);
    pattern.gapAfter = 3;
    return pattern;
  }

  /** Only coins: used while the boss is around and right after a zone change. */
  coinsOnly(speed) {
    const lane = this.rng.int(0, 2);
    return this._finish('coinsOnly', { length: 6 * COIN_SPACING, items: coinLine(lane, 0, 7) }, speed, 0);
  }

  next(level, speed, drones = 0) {
    const ctx = { rng: this.rng, speed, level, drones };
    if (this.count === 0) return this._finish('coinLine', PATTERNS3D[0].build(ctx), speed, level);
    const [a, b] = this.history.slice(-2);
    let pool = PATTERNS3D.filter((p) => level >= p.minLevel && (!p.allowed || p.allowed(ctx)));
    if (a && a === b) pool = pool.filter((p) => p.key !== a);
    const total = pool.reduce((s, p) => s + p.weight(level), 0);
    let roll = this.rng.next() * total;
    let pick = pool[pool.length - 1];
    for (const p of pool) {
      roll -= p.weight(level);
      if (roll <= 0) {
        pick = p;
        break;
      }
    }
    return this._finish(pick.key, pick.build(ctx), speed, level);
  }
}
