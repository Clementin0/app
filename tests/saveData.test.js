import { describe, expect, it } from 'vitest';
import { FREE_COINS, HATS, WEAPONS } from '../src/config/cosmetics.js';
import { UPGRADES } from '../src/config/upgrades.js';
import { SAVE_KEY, SaveData } from '../src/services/SaveData.js';
import { MemoryStorage } from './helpers.js';

describe('SaveData (LocalStorage)', () => {
  it('stores and reloads the high score and best distance', () => {
    const storage = new MemoryStorage();
    const save = new SaveData(storage);
    expect(save.submitScore(120, 90)).toBe(true);
    expect(save.submitScore(80, 40)).toBe(false);
    const again = new SaveData(storage);
    expect(again.highScore).toBe(120);
    expect(again.bestDistance).toBe(90);
  });

  it('accumulates currency, games and lifetime stats; saves settings', () => {
    const storage = new MemoryStorage();
    const save = new SaveData(storage);
    save.addCurrency(5, 1);
    save.incrementGamesPlayed();
    save.addLifetime({ kills: 12, bosses: 1 });
    save.setSetting('music', false);
    save.setSetting('quality', 'high');
    save.setLanguage('en');
    expect(new SaveData(storage).snapshot()).toMatchObject({ totalCoins: 5, totalGems: 1, gamesPlayed: 1, music: false, quality: 'high', lang: 'en', lifetime: { kills: 12, bosses: 1, runs: 1 } });
    expect(() => save.setSetting('quality', 'ultra')).toThrow();
    expect(() => save.setSetting('bogus', 1)).toThrow();
  });

  it('keeps graphics in automatic mode until the player picks a level', () => {
    const storage = new MemoryStorage();
    const save = new SaveData(storage);
    expect(save.snapshot()).toMatchObject({ quality: 'medium', qualityAuto: true });
    save.setAutoQuality('low');
    expect(new SaveData(storage).snapshot()).toMatchObject({ quality: 'low', qualityAuto: true });
    save.setSetting('quality', 'high');
    expect(new SaveData(storage).snapshot()).toMatchObject({ quality: 'high', qualityAuto: false });
    expect(() => save.setAutoQuality('ultra')).toThrow();
  });

  it('migrates v1.0 and v1.1 saves (mute flag, bought skins)', () => {
    const v11 = { highScore: 50, muted: true, ownedSkins: ['neon', 'lime', 'nope'], selectedSkin: 'lime', totalCoins: 40 };
    const save = new SaveData(new MemoryStorage({ [SAVE_KEY]: JSON.stringify(v11) }));
    const s = save.snapshot();
    expect(s).toMatchObject({ highScore: 50, music: false, sfx: false, totalCoins: 40 });
    expect(s.owned.skin).toEqual(['neon', 'lime']);
    expect(s.equipped).toEqual({ skin: 'lime', hat: 'none', weapon: 'blaster', trail: 'neon' });
    expect(s.upgrades.damage).toBe(0);
  });

  it('survives corrupted or tampered data', () => {
    expect(new SaveData(new MemoryStorage({ [SAVE_KEY]: '{oops' })).highScore).toBe(0);
    const tampered = new SaveData(
      new MemoryStorage({ [SAVE_KEY]: JSON.stringify({ highScore: -5, totalCoins: 'lots', upgrades: { damage: 99 }, equipped: { hat: 'crown' }, owned: { hat: ['crown'] }, quality: 'ultra' }) }),
    );
    const s = tampered.snapshot();
    expect(s).toMatchObject({ highScore: 0, totalCoins: 0, quality: 'medium' });
    expect(s.upgrades.damage).toBe(UPGRADES.find((u) => u.id === 'damage').costs.length);
    expect(s.equipped.hat).toBe('crown');
  });

  it('works in memory when storage is unavailable', () => {
    const save = new SaveData(null);
    expect(save.submitScore(10)).toBe(true);
    expect(save.persist()).toBe(false);
  });
});

describe('SaveData - shop', () => {
  const hat = HATS.find((h) => h.price > 0 && !h.currency);
  const gemWeapon = WEAPONS.find((w) => w.currency === 'gems');

  it('buys items with the right currency, equips them and persists', () => {
    const storage = new MemoryStorage();
    const save = new SaveData(storage);
    expect(save.canAffordSomething()).toBe(false);
    expect(save.buy('hat', hat.id)).toBe('insufficient');
    save.addCurrency(hat.price, 0);
    expect(save.buy('hat', hat.id)).toBe('bought');
    expect(save.equippedId('hat')).toBe(hat.id);
    expect(save.buy('hat', hat.id)).toBe('owned');
    expect(save.buy('weapon', gemWeapon.id)).toBe('insufficient');
    save.addCurrency(0, gemWeapon.price);
    expect(save.buy('weapon', gemWeapon.id)).toBe('bought');
    expect(new SaveData(storage).equippedId('weapon')).toBe(gemWeapon.id);
    expect(() => save.buy('hat', 'nope')).toThrow();
  });

  it('only equips owned items', () => {
    const save = new SaveData(new MemoryStorage());
    expect(save.equip('hat', 'crown')).toBe(false);
    expect(save.equip('hat', 'none')).toBe(true);
  });

  it('upgrades level up until maxed', () => {
    const save = new SaveData(new MemoryStorage());
    const shield = UPGRADES.find((u) => u.id === 'startShield');
    expect(save.buyUpgrade('startShield')).toBe('insufficient');
    save.addCurrency(shield.costs[0], 0);
    expect(save.canAffordSomething()).toBe(true);
    expect(save.buyUpgrade('startShield')).toBe('bought');
    expect(save.upgradeLevel('startShield')).toBe(1);
    expect(save.buyUpgrade('startShield')).toBe('maxed');
    expect(save.snapshot().totalCoins).toBe(0);
  });

  it('grants free coins from the rewarded video once per cooldown', () => {
    let now = 1_000_000;
    const save = new SaveData(new MemoryStorage(), () => now);
    expect(save.claimFreeCoins()).toBe(FREE_COINS.amount);
    expect(save.claimFreeCoins()).toBe(0);
    now += FREE_COINS.cooldownMs;
    expect(save.claimFreeCoins()).toBe(FREE_COINS.amount);
  });

  it('a clock moved back does not lock the free coins for longer than one cooldown', () => {
    let now = 50_000_000;
    const save = new SaveData(new MemoryStorage(), () => now);
    save.claimFreeCoins(); // claimed with the clock a day ahead...
    now -= 86_400_000; // ...then corrected
    expect(save.freeCoinsCooldownLeft()).toBeLessThanOrEqual(FREE_COINS.cooldownMs);
  });
});
