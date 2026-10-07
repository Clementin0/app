import { describe, expect, it } from 'vitest';
import { AutoQuality, lowerQuality } from '../src/services/AutoQuality.js';

const run = (aq, fps, seconds) => {
  let hits = 0;
  for (let t = 0; t < seconds; t += 1 / fps) if (aq.sample(1 / fps)) hits += 1;
  return hits;
};

describe('AutoQuality', () => {
  it('never asks for a change on a smooth device', () => {
    expect(run(new AutoQuality(), 60, 120)).toBe(0);
    expect(run(new AutoQuality(), 45, 120)).toBe(0);
  });

  it('asks for a lower level after warm-up + one slow window', () => {
    const aq = new AutoQuality({ warmup: 2.5, window: 4 });
    expect(run(aq, 25, 6)).toBe(0);
    expect(run(aq, 25, 1)).toBe(1);
  });

  it('waits for a new warm-up after each change', () => {
    const aq = new AutoQuality({ warmup: 2.5, window: 4 });
    expect(run(aq, 20, 6.6)).toBe(1);
    expect(run(aq, 20, 6.2)).toBe(0);
    expect(run(aq, 20, 0.6)).toBe(1);
  });

  it('ignores pauses and app switches', () => {
    const aq = new AutoQuality();
    for (let i = 0; i < 50; i++) expect(aq.sample(3)).toBe(false);
    expect(aq.sample(0)).toBe(false);
    expect(aq.sample(Number.NaN)).toBe(false);
    expect(run(aq, 60, 30)).toBe(0);
  });

  it('steps quality down one level at a time', () => {
    expect(lowerQuality('high')).toBe('medium');
    expect(lowerQuality('medium')).toBe('low');
    expect(lowerQuality('low')).toBe(null);
    expect(lowerQuality('nope')).toBe(null);
  });
});
