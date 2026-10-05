import { describe, expect, it } from 'vitest';
import { gapRange, maxPitWidth, speedAt } from '../src/logic/Difficulty.js';
import { createRng } from '../src/logic/rng.js';
import { PATTERNS, Spawner } from '../src/logic/Spawner.js';

const VALID_TYPES = new Set(['spike', 'block', 'saw', 'gap', 'coin', 'gem']);

describe('Spawner', () => {
  it('is deterministic for a given seed', () => {
    const a = new Spawner(createRng(7));
    const b = new Spawner(createRng(7));
    for (let i = 0; i < 50; i++) expect(a.next(3, 600)).toEqual(b.next(3, 600));
  });

  it('only uses patterns unlocked at the current level', () => {
    const s = new Spawner(createRng(1));
    for (let i = 0; i < 300; i++) {
      const p = s.next(0, speedAt(0));
      const def = PATTERNS.find((x) => x.key === p.key);
      expect(def.minLevel).toBe(0);
    }
  });

  it('never repeats the same pattern three times in a row', () => {
    const s = new Spawner(createRng(3));
    const keys = Array.from({ length: 500 }, () => s.next(4, 800).key);
    for (let i = 2; i < keys.length; i++) {
      expect(keys[i] === keys[i - 1] && keys[i] === keys[i - 2]).toBe(false);
    }
  });

  it('produces valid items, safe gaps and jumpable pits at every level', () => {
    const s = new Spawner(createRng(11));
    for (let level = 0; level <= 8; level++) {
      const speed = speedAt(level * 15);
      for (let i = 0; i < 200; i++) {
        const p = s.next(level, speed);
        expect(p.width).toBeGreaterThan(0);
        expect(p.gapAfter).toBeGreaterThanOrEqual(gapRange(speed, level).min);
        for (const item of p.items) {
          expect(VALID_TYPES.has(item.type)).toBe(true);
          expect(Number.isFinite(item.dx)).toBe(true);
          if (item.type === 'gap') expect(item.w).toBeLessThanOrEqual(Math.max(150, maxPitWidth(speed)) + 1);
        }
      }
    }
  });
});
