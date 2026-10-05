import { describe, expect, it } from 'vitest';
import { PHYSICS, SPEED } from '../src/config/game.config.js';
import { gapRange, jumpAirtime, levelAt, maxPitWidth, speedAt } from '../src/logic/Difficulty.js';

describe('Difficulty', () => {
  it('starts at the base speed and increases over time up to the cap', () => {
    expect(speedAt(0)).toBeCloseTo(SPEED.start);
    let prev = speedAt(0);
    for (let t = 5; t <= 600; t += 5) {
      const v = speedAt(t);
      expect(v).toBeGreaterThan(prev);
      expect(v).toBeLessThanOrEqual(SPEED.max);
      prev = v;
    }
    expect(speedAt(10_000)).toBeCloseTo(SPEED.max, 3);
    expect(speedAt(-5)).toBeCloseTo(SPEED.start);
  });

  it('raises the level every N seconds, capped', () => {
    expect(levelAt(0)).toBe(0);
    expect(levelAt(SPEED.levelEvery - 0.01)).toBe(0);
    expect(levelAt(SPEED.levelEvery)).toBe(1);
    expect(levelAt(99_999)).toBe(SPEED.maxLevel);
  });

  it('always leaves room to land after a full jump', () => {
    for (const speed of [SPEED.start, 700, SPEED.max]) {
      for (let level = 0; level <= SPEED.maxLevel; level++) {
        const { min, max } = gapRange(speed, level);
        expect(min).toBeGreaterThan(jumpAirtime(PHYSICS) * speed * 0.9);
        expect(max).toBeGreaterThan(min);
      }
    }
  });

  it('keeps pits narrower than a jump can cover', () => {
    for (const speed of [SPEED.start, 700, SPEED.max]) {
      expect(maxPitWidth(speed)).toBeLessThan(jumpAirtime(PHYSICS) * speed * 0.7);
    }
  });
});
