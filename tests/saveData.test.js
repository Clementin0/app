import { describe, expect, it } from 'vitest';
import { SAVE_KEY, SaveData } from '../src/services/SaveData.js';
import { MemoryStorage } from './helpers.js';

describe('SaveData (LocalStorage)', () => {
  it('stores and reloads the high score', () => {
    const storage = new MemoryStorage();
    const save = new SaveData(storage);
    expect(save.highScore).toBe(0);
    expect(save.submitScore(120, 90)).toBe(true);
    expect(save.submitScore(80, 40)).toBe(false);
    expect(new SaveData(storage).highScore).toBe(120);
    expect(JSON.parse(storage.getItem(SAVE_KEY)).bestDistance).toBe(90);
  });

  it('accumulates coins, gems, games played and the mute setting', () => {
    const storage = new MemoryStorage();
    const save = new SaveData(storage);
    save.addCurrency(5, 1);
    save.addCurrency(3, 0);
    save.incrementGamesPlayed();
    save.setMuted(true);
    const again = new SaveData(storage).snapshot();
    expect(again).toMatchObject({ totalCoins: 8, totalGems: 1, gamesPlayed: 1, muted: true });
  });

  it('survives corrupted or tampered data', () => {
    const corrupted = new SaveData(new MemoryStorage({ [SAVE_KEY]: '{not json' }));
    expect(corrupted.highScore).toBe(0);
    const tampered = new SaveData(new MemoryStorage({ [SAVE_KEY]: JSON.stringify({ highScore: -5, totalCoins: 'lots', muted: 'yes' }) }));
    expect(tampered.snapshot()).toMatchObject({ highScore: 0, totalCoins: 0, muted: false });
  });

  it('works in memory when storage is unavailable', () => {
    const save = new SaveData(null);
    expect(save.submitScore(10)).toBe(true);
    expect(save.highScore).toBe(10);
    expect(save.persist()).toBe(false);
  });

  it('ignores negative currency', () => {
    const save = new SaveData(new MemoryStorage());
    save.addCurrency(-10, -2);
    expect(save.snapshot()).toMatchObject({ totalCoins: 0, totalGems: 0 });
  });
});
