import { describe, expect, it } from 'vitest';
import { ScoreManager } from '../src/logic/ScoreManager.js';

const scoring = { pointsPerMeter: 1, coinValue: 10, gemValue: 50 };

describe('ScoreManager', () => {
  it('scores distance in meters plus coin and gem bonuses', () => {
    const s = new ScoreManager({ scoring, pixelsPerMeter: 40 });
    s.addDistance(400); // 10 m
    s.addCoin();
    s.addCoin(2);
    s.addGem();
    expect(s.meters).toBe(10);
    expect(s.coins).toBe(3);
    expect(s.gems).toBe(1);
    expect(s.score).toBe(10 + 30 + 50);
  });

  it('ignores invalid distance values', () => {
    const s = new ScoreManager({ scoring, pixelsPerMeter: 40 });
    s.addDistance(-100);
    s.addDistance(NaN);
    s.addDistance(Infinity);
    expect(s.score).toBe(0);
  });

  it('reports passing the previous best exactly once', () => {
    const s = new ScoreManager({ scoring, pixelsPerMeter: 1, best: 5 });
    s.addDistance(5);
    expect(s.checkPassedBest()).toBe(false);
    s.addDistance(1);
    expect(s.checkPassedBest()).toBe(true);
    s.addDistance(10);
    expect(s.checkPassedBest()).toBe(false);
  });

  it('never fires "passed best" when there is no previous record', () => {
    const s = new ScoreManager({ scoring, pixelsPerMeter: 1, best: 0 });
    s.addDistance(100);
    expect(s.checkPassedBest()).toBe(false);
  });

  it('summarises a run and flags a new record', () => {
    const s = new ScoreManager({ scoring, pixelsPerMeter: 1, best: 20 });
    s.addDistance(30);
    expect(s.summary()).toMatchObject({ score: 30, best: 30, previousBest: 20, isNewBest: true, meters: 30 });
    s.reset();
    s.addDistance(5);
    expect(s.summary()).toMatchObject({ score: 5, best: 20, isNewBest: false });
  });
});
