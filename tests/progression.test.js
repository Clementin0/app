import { describe, expect, it } from 'vitest';
import { addXp, levelReward, xpForRun, xpToNext } from '../src/logic/Progression.js';
import { CHALLENGE_MODIFIERS, dailyChallenge } from '../src/services/DailyChallenge.js';
import { SaveData } from '../src/services/SaveData.js';
import { MemoryStorage } from './helpers.js';

describe('Player level', () => {
  it('gives XP for distance, kills, bosses, events and perks', () => {
    expect(xpForRun({ meters: 1000, kills: 10, bosses: 1, events: 2, perks: 1 })).toBe(100 + 20 + 60 + 50 + 10);
    expect(xpForRun({ meters: -5, kills: NaN })).toBe(0);
    expect(xpForRun(null)).toBe(0);
  });

  it('levels up with growing thresholds and pays rewards', () => {
    expect(xpToNext(1)).toBe(120);
    expect(xpToNext(2)).toBe(180);
    const r = addXp({ level: 1, xp: 100 }, 250); // 350 = 120 + 180 + 50
    expect(r.level).toBe(3);
    expect(r.xp).toBe(50);
    expect(r.levelsUp.map((l) => l.level)).toEqual([2, 3]);
    expect(levelReward(5).gems).toBe(5);
    expect(levelReward(4).gems).toBe(0);
  });

  it('is saved with its rewards', () => {
    const storage = new MemoryStorage();
    const save = new SaveData(storage);
    const before = save.snapshot().totalCoins;
    const result = save.addXp(400);
    expect(result.levelsUp.length).toBeGreaterThan(0);
    const again = new SaveData(storage).snapshot();
    expect(again.level).toBe(result.level);
    expect(again.totalCoins).toBe(before + result.levelsUp.reduce((s, l) => s + l.reward.coins, 0));
  });
});

describe('Daily challenge', () => {
  const noon = (d) => new Date(2026, 9, d, 12).getTime();

  it('is the same all day and changes every day', () => {
    expect(dailyChallenge(noon(10))).toEqual(dailyChallenge(new Date(2026, 9, 10, 23, 30).getTime()));
    expect(dailyChallenge(noon(10)).seed).not.toBe(dailyChallenge(noon(11)).seed);
    const ids = new Set(Array.from({ length: 7 }, (_, i) => dailyChallenge(noon(10 + i)).modifier.id));
    expect(ids.size).toBe(CHALLENGE_MODIFIERS.length);
  });

  it('keeps the best score of the day and pays its reward once', () => {
    let now = noon(10);
    const save = new SaveData(new MemoryStorage(), () => now);
    expect(save.challengeStatus()).toMatchObject({ best: 0, done: false });
    expect(save.submitChallenge({ score: 500, bosses: 0 })).toBeNull();
    const reward = save.submitChallenge({ score: 300, bosses: 1 });
    expect(reward).toEqual({ coins: 150, gems: 5 });
    expect(save.submitChallenge({ score: 900, bosses: 2 })).toBeNull(); // once per day
    expect(save.challengeStatus()).toMatchObject({ best: 900, done: true });
    now = noon(11);
    expect(save.challengeStatus()).toMatchObject({ best: 0, done: false });
  });

  it('remembers the boss rush record', () => {
    const save = new SaveData(new MemoryStorage());
    expect(save.submitBossRush({ bosses: 3, score: 5000 })).toBe(true);
    expect(save.submitBossRush({ bosses: 2, score: 9000 })).toBe(false);
    expect(save.snapshot().bossRushBest).toEqual({ bosses: 3, score: 5000 });
  });
});
