import { GAME_CONFIG } from '../config/game.config.js';
import { gapRange, jumpAirtime, maxPitWidth } from './Difficulty.js';

/**
 * Obstacle patterns. Each pattern builds a list of item specs relative to
 * the pattern's left edge:
 *   dx = horizontal offset (center for objects, left edge for gaps)
 *   dy = height of the object's center above the running surface
 * Sizes are chosen against the jump physics so every pattern is beatable:
 *   full jump apex ~192px, tap jump ~125px, double jump ~350px.
 */

export const SIZES = Object.freeze({
  spike: { w: 56, h: 56 },
  blockLow: { w: 90, h: 80 },
  blockTall: { w: 90, h: 130 },
  sawLow: { r: 34, dy: 38 },
  sawHigh: { r: 36, dy: 172 },
  coin: { r: 20 },
  gem: { r: 22 },
  powerup: { r: 28 },
});

const COIN_SPACING = 58;

function spikes(n, startDx = 0) {
  const { w, h } = SIZES.spike;
  return Array.from({ length: n }, (_, i) => ({ type: 'spike', dx: startDx + w / 2 + i * w, w, h }));
}

function block(dx, size) {
  return { type: 'block', dx, w: size.w, h: size.h };
}

/** Coins along a jump-shaped parabola centered on `centerDx`. */
export function arcCoins(centerDx, halfSpan, peak, n = 5, base = 40) {
  return Array.from({ length: n }, (_, i) => {
    const u = n === 1 ? 0 : -1 + (2 * i) / (n - 1);
    return { type: 'coin', dx: centerDx + u * halfSpan, dy: base + peak * (1 - u * u) };
  });
}

export function lineCoins(startDx, n, dy = 34, spacing = COIN_SPACING) {
  return Array.from({ length: n }, (_, i) => ({ type: 'coin', dx: startDx + i * spacing, dy }));
}

function jumpArc(ctx, centerDx, extraPeak = 0) {
  const halfSpan = Math.min(260, jumpAirtime() * ctx.speed * 0.36);
  return arcCoins(centerDx, halfSpan, 140 + extraPeak, 5);
}

/** weight(level) -> relative probability; 0 disables the pattern. */
export const PATTERNS = [
  {
    key: 'spike1',
    minLevel: 0,
    weight: (l) => Math.max(1, 4 - l * 0.5),
    build: (ctx) => {
      const items = spikes(1);
      if (ctx.rng.chance(0.6)) items.push(...jumpArc(ctx, 28));
      return { width: SIZES.spike.w, items };
    },
  },
  {
    key: 'spike2',
    minLevel: 0,
    weight: () => 3,
    build: (ctx) => {
      const items = spikes(2);
      if (ctx.rng.chance(0.6)) items.push(...jumpArc(ctx, SIZES.spike.w));
      return { width: SIZES.spike.w * 2, items };
    },
  },
  {
    key: 'spike3',
    minLevel: 2,
    weight: (l) => 1.5 + l * 0.3,
    build: (ctx) => {
      const items = spikes(3);
      if (ctx.rng.chance(0.6)) items.push(...jumpArc(ctx, SIZES.spike.w * 1.5, 20));
      return { width: SIZES.spike.w * 3, items };
    },
  },
  {
    key: 'blockLow',
    minLevel: 0,
    weight: () => 2.5,
    build: (ctx) => {
      const s = SIZES.blockLow;
      const items = [block(s.w / 2, s)];
      if (ctx.rng.chance(0.7)) items.push(...lineCoins(s.w / 2 - COIN_SPACING / 2, 2, s.h + 34));
      return { width: s.w, items };
    },
  },
  {
    key: 'blockTall',
    minLevel: 1,
    weight: () => 2,
    build: (ctx) => {
      const s = SIZES.blockTall;
      const items = [block(s.w / 2, s)];
      if (ctx.rng.chance(0.7)) items.push(...lineCoins(s.w / 2 - COIN_SPACING / 2, 2, s.h + 34));
      return { width: s.w, items };
    },
  },
  {
    key: 'stairs',
    minLevel: 2,
    weight: () => 1.8,
    build: (ctx) => {
      const lo = SIZES.blockLow;
      const hi = SIZES.blockTall;
      const items = [block(lo.w / 2, lo), block(lo.w + hi.w / 2, hi)];
      if (ctx.rng.chance(0.7)) {
        items.push({ type: 'coin', dx: lo.w / 2, dy: lo.h + 34 }, { type: 'coin', dx: lo.w + hi.w / 2, dy: hi.h + 34 });
      }
      return { width: lo.w + hi.w, items };
    },
  },
  {
    key: 'platform',
    minLevel: 1,
    weight: () => 1.6,
    build: (ctx) => {
      const s = { w: ctx.rng.pick([220, 270, 320]), h: 80 };
      const items = [block(s.w / 2, s), ...lineCoins(40, Math.floor((s.w - 40) / COIN_SPACING), s.h + 34)];
      return { width: s.w, items };
    },
  },
  {
    key: 'pit',
    minLevel: 1,
    weight: (l) => 2 + l * 0.2,
    build: (ctx) => {
      const w = Math.round(ctx.rng.range(130, Math.max(150, maxPitWidth(ctx.speed))));
      const items = [{ type: 'gap', dx: 0, w }];
      if (ctx.rng.chance(0.8)) items.push(...jumpArc(ctx, w / 2, 10));
      return { width: w, items };
    },
  },
  {
    key: 'sawLow',
    minLevel: 1,
    weight: () => 2,
    build: (ctx) => {
      const { r, dy } = SIZES.sawLow;
      const items = [{ type: 'saw', dx: r, dy, r }];
      if (ctx.rng.chance(0.6)) items.push(...jumpArc(ctx, r));
      return { width: r * 2, items };
    },
  },
  {
    key: 'sawHigh',
    minLevel: 2,
    weight: (l) => 1.2 + l * 0.2,
    build: () => {
      // Stay on the ground: the coins underneath hint at the safe path.
      const { r, dy } = SIZES.sawHigh;
      return { width: r * 2, items: [{ type: 'saw', dx: r, dy, r }, ...lineCoins(r - COIN_SPACING, 3, 30)] };
    },
  },
  {
    key: 'sawHighDouble',
    minLevel: 5,
    weight: () => 1,
    build: () => {
      const { r, dy } = SIZES.sawHigh;
      const spacing = r * 2 + 90;
      return {
        width: spacing + r * 2,
        items: [
          { type: 'saw', dx: r, dy, r },
          { type: 'saw', dx: r + spacing, dy, r },
          ...lineCoins(r - COIN_SPACING, 5, 30),
        ],
      };
    },
  },
  {
    key: 'blockSpike',
    minLevel: 3,
    weight: () => 1.4,
    build: (ctx) => {
      // Jump on the block, then jump the spike that follows it.
      const s = SIZES.blockLow;
      const spikeGap = Math.round(Math.max(60, ctx.speed * 0.18));
      const items = [block(s.w / 2, s), ...spikes(1, s.w + spikeGap)];
      items.push({ type: 'coin', dx: s.w / 2, dy: s.h + 34 });
      return { width: s.w + spikeGap + SIZES.spike.w, items };
    },
  },
  {
    key: 'breather',
    minLevel: 0,
    weight: (l) => Math.max(0.8, 2.5 - l * 0.25),
    build: (ctx) => {
      const n = ctx.rng.int(5, 8);
      const wave = ctx.rng.chance(0.5);
      const items = lineCoins(0, n, 34).map((c, i) => (wave ? { ...c, dy: 34 + Math.sin(i * 0.9) * 26 + 26 } : c));
      return { width: (n - 1) * COIN_SPACING, items };
    },
  },
];

export class Spawner {
  constructor(rng, config = GAME_CONFIG) {
    this.rng = rng;
    this.config = config;
    this.reset();
  }

  reset() {
    this.history = [];
  }

  available(level) {
    return PATTERNS.filter((p) => level >= p.minLevel && p.weight(level) > 0);
  }

  pick(level) {
    const pool = this.available(level);
    // Never the same pattern three times in a row.
    const [a, b] = this.history.slice(-2);
    const filtered = a && a === b ? pool.filter((p) => p.key !== a) : pool;
    const candidates = filtered.length ? filtered : pool;
    const total = candidates.reduce((sum, p) => sum + p.weight(level), 0);
    let roll = this.rng.next() * total;
    for (const p of candidates) {
      roll -= p.weight(level);
      if (roll <= 0) return p;
    }
    return candidates[candidates.length - 1];
  }

  /** Builds the next pattern and the free distance that must follow it. */
  next(level, speed) {
    const pattern = this.pick(level);
    const built = pattern.build({ rng: this.rng, speed, level });
    const items = [...built.items];

    // Rare gem high above the pattern: reachable only with a double jump.
    if (level >= 1 && pattern.key !== 'sawHigh' && pattern.key !== 'sawHighDouble' && this.rng.chance(0.12)) {
      items.push({ type: 'gem', dx: built.width / 2, dy: 300 });
    }

    this.history.push(pattern.key);
    if (this.history.length > 8) this.history.shift();

    const gap = gapRange(speed, level, this.config.PHYSICS);
    return { key: pattern.key, width: built.width, items, gapAfter: this.rng.range(gap.min, gap.max) };
  }
}
