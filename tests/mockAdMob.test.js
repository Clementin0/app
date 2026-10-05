import { describe, expect, it } from 'vitest';
import admobConfig from '../src/config/admob.config.js';
import { AdService } from '../src/services/AdService.js';
import { MockAdMob } from '../src/services/MockAdMob.js';

describe('MockAdMob (browser stand-in) works end-to-end with AdService', () => {
  it('runs banner, rewarded and interstitial flows headless', async () => {
    const plugin = new MockAdMob({ document: null, durations: { interstitial: 5, rewarded: 5 }, loadDelayMs: 1 });
    const ads = new AdService({ plugin, config: admobConfig, logger: { warn: () => {} } });
    await ads.init();
    await ads.showBanner();
    expect(ads.getBannerReserveDp()).toBe(50);

    await new Promise((r) => setTimeout(r, 10));
    expect(await ads.showRewarded()).toEqual({ shown: true, rewarded: true });

    await new Promise((r) => setTimeout(r, 10));
    const shown = [];
    for (let i = 0; i < 3; i++) shown.push(await ads.registerCompletedGame());
    expect(shown).toEqual([false, false, true]);
    expect(plugin.calls.map((c) => c.method)).toEqual(expect.arrayContaining(['initialize', 'showBanner', 'showRewardVideoAd', 'showInterstitial']));
  });
});
