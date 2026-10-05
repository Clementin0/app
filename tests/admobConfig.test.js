import { describe, expect, it } from 'vitest';
import admobConfig, { hasRealProductionIds, PRODUCTION_IDS, resolveAdIds, TEST_IDS } from '../src/config/admob.config.js';

describe('admob.config.js', () => {
  it('uses the official Google AdMob test IDs during development', () => {
    expect(TEST_IDS).toEqual({
      appId: 'ca-app-pub-3940256099942544~3347511713',
      banner: 'ca-app-pub-3940256099942544/9214589741',
      interstitial: 'ca-app-pub-3940256099942544/1033173712',
      rewarded: 'ca-app-pub-3940256099942544/5224354917',
    });
    expect(admobConfig.ids).toEqual(TEST_IDS);
    expect(admobConfig.testing).toBe(true);
  });

  it('shows an interstitial every 3 games', () => {
    expect(admobConfig.interstitialEveryNGames).toBe(3);
  });

  it('falls back to test IDs while production IDs are placeholders', () => {
    expect(hasRealProductionIds(PRODUCTION_IDS)).toBe(false);
    const r = resolveAdIds(false, PRODUCTION_IDS);
    expect(r.ids).toEqual(TEST_IDS);
    expect(r.testing).toBe(true);
    expect(r.warning).toMatch(/placeholder/i);
  });

  it('uses real production IDs when provided', () => {
    const real = {
      appId: 'ca-app-pub-1234567890123456~1234567890',
      banner: 'ca-app-pub-1234567890123456/1111111111',
      interstitial: 'ca-app-pub-1234567890123456/2222222222',
      rewarded: 'ca-app-pub-1234567890123456/3333333333',
    };
    expect(resolveAdIds(false, real)).toEqual({ ids: real, testing: false });
  });
});
