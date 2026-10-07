import { describe, expect, it } from 'vitest';
import { DAILY_REWARDS, dailyStatus, dayNumber } from '../src/services/DailyReward.js';
import { SaveData } from '../src/services/SaveData.js';
import { MemoryStorage } from './helpers.js';

const DAY = 86400000;
// Local noon, so adding whole days never crosses a calendar boundary twice.
const start = new Date(2026, 9, 5, 12, 0, 0).getTime();

describe('Daily reward', () => {
  it('counts local calendar days', () => {
    expect(dayNumber(start + DAY) - dayNumber(start)).toBe(1);
    expect(dayNumber(new Date(2026, 9, 5, 0, 1).getTime())).toBe(dayNumber(new Date(2026, 9, 5, 23, 59).getTime()));
  });

  it('is available once per day and climbs a 7-day ladder', () => {
    let now = start;
    const save = new SaveData(new MemoryStorage(), () => now);
    const days = [];
    for (let i = 0; i < 9; i++) {
      expect(save.dailyStatus().available).toBe(true);
      const granted = save.claimDaily();
      days.push(granted.day);
      expect(save.claimDaily()).toBeNull(); // second claim the same day
      now += DAY;
    }
    expect(days).toEqual([1, 2, 3, 4, 5, 6, 7, 1, 2]);
    const total = DAILY_REWARDS.reduce((sum, r) => sum + r.coins, 0) + DAILY_REWARDS[0].coins + DAILY_REWARDS[1].coins;
    expect(save.snapshot().totalCoins).toBe(total);
    expect(save.snapshot().totalGems).toBe(DAILY_REWARDS.reduce((sum, r) => sum + r.gems, 0));
  });

  it('missing a day restarts the streak', () => {
    let now = start;
    const save = new SaveData(new MemoryStorage(), () => now);
    save.claimDaily();
    now += DAY;
    save.claimDaily();
    now += 3 * DAY;
    expect(save.dailyStatus()).toMatchObject({ available: true, day: 1, streak: 1 });
  });

  it('can be doubled (rewarded video) and persists across restarts', () => {
    const storage = new MemoryStorage();
    let now = start;
    const save = new SaveData(storage, () => now);
    expect(save.claimDaily(2)).toEqual({ coins: DAILY_REWARDS[0].coins * 2, gems: 0, day: 1 });
    const again = new SaveData(storage, () => now);
    expect(again.dailyStatus().available).toBe(false);
    now += DAY;
    expect(new SaveData(storage, () => now).dailyStatus()).toMatchObject({ available: true, day: 2 });
  });

  it('survives corrupted state', () => {
    expect(dailyStatus({ lastDay: 'x', streak: -4 }, start).available).toBe(true);
    const save = new SaveData(new MemoryStorage({ 'neondash.save.v1': JSON.stringify({ daily: { lastDay: 'soon', streak: 'many' } }) }), () => start);
    expect(save.dailyStatus()).toMatchObject({ available: true, day: 1 });
  });
});
