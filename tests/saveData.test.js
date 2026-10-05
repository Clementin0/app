import { describe, expect, it } from 'vitest';
import { FREE_COINS, SKINS } from '../src/config/skins.js';
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
    expect(new SaveData(storage).bestDistance).toBe(90);
    expect(JSON.parse(storage.getItem(SAVE_KEY)).highScore).toBe(120);
  });

  it('accumulates coins, gems, games played and settings', () => {
    const storage = new MemoryStorage();
    const save = new SaveData(storage);
    save.addCurrency(5, 1);
    save.addCurrency(3, 0);
    save.incrementGamesPlayed();
    save.setSetting('music', false);
    save.setSetting('vibration', false);
    save.setLanguage('en');
    const again = new SaveData(storage).snapshot();
    expect(again).toMatchObject({ totalCoins: 8, totalGems: 1, gamesPlayed: 1, music: false, sfx: true, vibration: false, lang: 'en' });
    expect(() => save.setSetting('bogus', true)).toThrow();
  });

  it('migrates the v1.0 "muted" flag', () => {
    const save = new SaveData(new MemoryStorage({ [SAVE_KEY]: JSON.stringify({ highScore: 50, muted: true }) }));
    expect(save.snapshot()).toMatchObject({ highScore: 50, music: false, sfx: false, selectedSkin: 'neon', ownedSkins: ['neon'] });
  });

  it('survives corrupted or tampered data', () => {
    const corrupted = new SaveData(new MemoryStorage({ [SAVE_KEY]: '{not json' }));
    expect(corrupted.highScore).toBe(0);
    const tampered = new SaveData(
      new MemoryStorage({ [SAVE_KEY]: JSON.stringify({ highScore: -5, totalCoins: 'lots', music: 'yes', ownedSkins: ['hacked', 'gold'], selectedSkin: 'hacked' }) }),
    );
    expect(tampered.snapshot()).toMatchObject({ highScore: 0, totalCoins: 0, music: true, ownedSkins: ['neon', 'gold'], selectedSkin: 'neon' });
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

describe('SaveData - skin shop', () => {
  const coinSkin = SKINS.find((s) => s.currency === 'coins' && s.price > 0);
  const gemSkin = SKINS.find((s) => s.currency === 'gems');

  it('owns and equips the default skin', () => {
    const save = new SaveData(new MemoryStorage());
    expect(save.ownsSkin('neon')).toBe(true);
    expect(save.snapshot().selectedSkin).toBe('neon');
    expect(save.buySkin('neon')).toBe('owned');
  });

  it('buys a skin with the right currency, equips it and persists it', () => {
    const storage = new MemoryStorage();
    const save = new SaveData(storage);
    expect(save.canAffordNewSkin()).toBe(false);
    expect(save.buySkin(coinSkin.id)).toBe('insufficient');
    save.addCurrency(coinSkin.price + 7, 0);
    expect(save.canAffordNewSkin()).toBe(true);
    expect(save.buySkin(coinSkin.id)).toBe('bought');
    expect(save.snapshot()).toMatchObject({ totalCoins: 7, selectedSkin: coinSkin.id });
    expect(new SaveData(storage).ownsSkin(coinSkin.id)).toBe(true);

    expect(save.buySkin(gemSkin.id)).toBe('insufficient'); // coins do not pay for gem skins
    save.addCurrency(0, gemSkin.price);
    expect(save.buySkin(gemSkin.id)).toBe('bought');
    expect(save.snapshot().totalGems).toBe(0);
  });

  it('only equips owned skins', () => {
    const save = new SaveData(new MemoryStorage());
    expect(save.selectSkin(gemSkin.id)).toBe(false);
    expect(save.selectSkin('neon')).toBe(true);
    expect(() => save.buySkin('does-not-exist')).toThrow();
  });

  it('grants free coins from the rewarded video once per cooldown', () => {
    let now = 1_000_000;
    const save = new SaveData(new MemoryStorage(), () => now);
    expect(save.freeCoinsCooldownLeft()).toBe(0);
    expect(save.claimFreeCoins()).toBe(FREE_COINS.amount);
    expect(save.claimFreeCoins()).toBe(0);
    expect(save.freeCoinsCooldownLeft()).toBe(FREE_COINS.cooldownMs);
    now += FREE_COINS.cooldownMs;
    expect(save.claimFreeCoins()).toBe(FREE_COINS.amount);
    expect(save.snapshot().totalCoins).toBe(FREE_COINS.amount * 2);
  });
});
