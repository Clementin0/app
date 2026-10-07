import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import admobConfig, { TEST_IDS } from '../src/config/admob.config.js';
import { BannerEvents, InterstitialEvents, RewardEvents } from '../src/services/adEvents.js';
import { AdService } from '../src/services/AdService.js';

/**
 * Fake @capacitor-community/admob plugin reproducing the native behaviour,
 * including the fact that showRewardVideoAd() never settles when the user
 * closes the ad without earning the reward.
 */
class FakeAdMob {
  constructor({ consent, rewarded = 'reward', interstitial = 'dismiss', failInit = false, failPrepare = false } = {}) {
    this.listeners = new Map();
    this.calls = [];
    this.rewardedBehaviour = rewarded;
    this.interstitialBehaviour = interstitial;
    this.failPrepare = failPrepare;
    this.consentInfo = consent ?? { status: 'NOT_REQUIRED', isConsentFormAvailable: false, canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' };

    const track = (name, impl) =>
      vi.fn(async (...args) => {
        this.calls.push(name);
        return impl?.(...args);
      });
    this.initialize = track('initialize', () => {
      if (failInit) throw new Error('init failed');
    });
    this.requestConsentInfo = track('requestConsentInfo', () => this.consentInfo);
    this.showConsentForm = track('showConsentForm', () => ({ ...this.consentInfo, status: 'OBTAINED', canRequestAds: true }));
    this.showPrivacyOptionsForm = track('showPrivacyOptionsForm');
    this.showBanner = track('showBanner', () => this.emit(BannerEvents.SizeChanged, { width: 400, height: 50 }));
    this.hideBanner = track('hideBanner', () => this.emit(BannerEvents.SizeChanged, { width: 0, height: 0 }));
    this.resumeBanner = track('resumeBanner', () => this.emit(BannerEvents.SizeChanged, { width: 400, height: 50 }));
    this.removeBanner = track('removeBanner');
    this.prepareInterstitial = track('prepareInterstitial', (o) => {
      if (this.failPrepare) throw new Error('no fill');
      return { adUnitId: o.adId };
    });
    this.prepareRewardVideoAd = track('prepareRewardVideoAd', (o) => {
      if (this.failPrepare) throw new Error('no fill');
      return { adUnitId: o.adId };
    });
    this.showInterstitial = track('showInterstitial', () => {
      setTimeout(() => {
        if (this.interstitialBehaviour === 'fail') this.emit(InterstitialEvents.FailedToShow, { code: 1, message: 'x' });
        else this.emit(InterstitialEvents.Dismissed);
      }, 0);
    });
    this.showRewardVideoAd = vi.fn((...args) => {
      this.calls.push('showRewardVideoAd', ...args.slice(0, 0));
      const b = this.rewardedBehaviour;
      if (b === 'reject') return Promise.reject(new Error('not prepared'));
      return new Promise((resolve) => {
        setTimeout(() => {
          if (b === 'reward') {
            this.emit(RewardEvents.Rewarded, { type: 'revive', amount: 1 });
            resolve({ type: 'revive', amount: 1 });
            this.emit(RewardEvents.Dismissed);
          } else if (b === 'late-reward') {
            this.emit(RewardEvents.Dismissed);
            setTimeout(() => this.emit(RewardEvents.Rewarded, { type: 'revive', amount: 1 }), 100);
          } else if (b === 'skip') {
            this.emit(RewardEvents.Dismissed); // promise never settles, like on Android
          } else if (b === 'fail') {
            this.emit(RewardEvents.FailedToShow, { code: 0, message: 'failed' });
          }
          // 'hang': nothing ever happens
        }, 0);
      });
    });
  }

  async addListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
    return { remove: async () => this.listeners.get(name).delete(fn) };
  }

  emit(name, data = {}) {
    for (const fn of this.listeners.get(name) ?? []) fn(data);
  }
}

const quietLogger = { warn: () => {}, info: () => {}, log: () => {} };

async function makeService(pluginOptions = {}, configOverrides = {}) {
  const plugin = new FakeAdMob(pluginOptions);
  const ads = new AdService({ plugin, config: { ...admobConfig, ...configOverrides }, logger: quietLogger });
  await ads.init();
  await vi.waitFor(() => expect(ads.interstitial.ready || pluginOptions.failPrepare || !ads.canRequestAds).toBe(true));
  return { ads, plugin };
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.useRealTimers());

describe('AdService - initialization', () => {
  it('gathers consent, initializes in testing mode and preloads full-screen ads with the test IDs', async () => {
    const { ads, plugin } = await makeService();
    expect(plugin.calls.indexOf('requestConsentInfo')).toBeLessThan(plugin.calls.indexOf('initialize'));
    expect(plugin.initialize).toHaveBeenCalledWith(expect.objectContaining({ initializeForTesting: true }));
    expect(plugin.prepareInterstitial).toHaveBeenCalledWith(expect.objectContaining({ adId: TEST_IDS.interstitial, isTesting: true }));
    expect(plugin.prepareRewardVideoAd).toHaveBeenCalledWith(expect.objectContaining({ adId: TEST_IDS.rewarded, isTesting: true }));
    expect(ads.initialized).toBe(true);
    expect(ads.isRewardedReady()).toBe(true);
  });

  it('init() is idempotent', async () => {
    const { ads, plugin } = await makeService();
    await ads.init();
    await ads.init();
    expect(plugin.initialize).toHaveBeenCalledTimes(1);
  });

  it('shows the UMP consent form when consent is required', async () => {
    const { ads, plugin } = await makeService({
      consent: { status: 'REQUIRED', isConsentFormAvailable: true, canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' },
    });
    expect(plugin.showConsentForm).toHaveBeenCalledTimes(1);
    expect(ads.canRequestAds).toBe(true);
    expect(ads.privacyOptionsRequired).toBe(true);
    await ads.showPrivacyOptions();
    expect(plugin.showPrivacyOptionsForm).toHaveBeenCalled();
  });

  it('requests no ads when the user did not give consent', async () => {
    const plugin = new FakeAdMob({ consent: { status: 'REQUIRED', isConsentFormAvailable: false, canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' } });
    const ads = new AdService({ plugin, config: admobConfig, logger: quietLogger });
    await ads.init();
    await ads.showBanner();
    expect(plugin.prepareInterstitial).not.toHaveBeenCalled();
    expect(plugin.showBanner).not.toHaveBeenCalled();
    expect(ads.getBannerReserveDp()).toBe(0);
  });

  it('never throws when the SDK fails to initialize', async () => {
    const plugin = new FakeAdMob({ failInit: true });
    const ads = new AdService({ plugin, config: admobConfig, logger: quietLogger });
    await expect(ads.init()).resolves.toBe(false);
    await expect(ads.showBanner()).resolves.toBeUndefined();
    await expect(ads.registerCompletedGame()).resolves.toBe(false);
    await expect(ads.showRewarded()).resolves.toMatchObject({ rewarded: false });
    expect(ads.initFailed).toBe(true);
    expect(ads.getBannerReserveDp()).toBe(0);
  });
});

describe('AdService - banner (menu and game over only)', () => {
  it('creates the banner once, then hides/resumes it', async () => {
    const { ads, plugin } = await makeService();
    await ads.showBanner();
    expect(plugin.showBanner).toHaveBeenCalledWith(expect.objectContaining({ adId: TEST_IDS.banner, position: 'BOTTOM_CENTER', adSize: 'ADAPTIVE_BANNER' }));
    await ads.hideBanner(); // gameplay
    await ads.showBanner(); // game over
    await ads.showBanner(); // no duplicate call
    expect(plugin.showBanner).toHaveBeenCalledTimes(1);
    expect(plugin.hideBanner).toHaveBeenCalledTimes(1);
    expect(plugin.resumeBanner).toHaveBeenCalledTimes(1);
    expect(ads.stats).toMatchObject({ bannerShows: 2, bannerHides: 1 });
  });

  it('coalesces rapid show/hide requests into the last requested state', async () => {
    const { ads, plugin } = await makeService();
    ads.showBanner();
    ads.hideBanner();
    await ads.showBanner();
    expect(ads.banner.visible).toBe(true);
    expect(plugin.showBanner).toHaveBeenCalledTimes(1);
    expect(plugin.hideBanner).not.toHaveBeenCalled();

    ads.hideBanner();
    ads.showBanner();
    await ads.hideBanner();
    expect(ads.banner.visible).toBe(false);
    expect(plugin.calls.filter((c) => c.endsWith('Banner'))).toEqual(['showBanner', 'hideBanner']);
  });

  it('applies a banner requested before init completed', async () => {
    const plugin = new FakeAdMob();
    const ads = new AdService({ plugin, config: admobConfig, logger: quietLogger });
    ads.showBanner(); // menu shown while the SDK is still starting
    await ads.init();
    await ads._bannerQueue;
    expect(plugin.showBanner).toHaveBeenCalledTimes(1);
  });

  it('reports the space to reserve for the banner', async () => {
    const { ads } = await makeService();
    expect(ads.getBannerReserveDp()).toBe(0);
    const changes = [];
    ads.on('bannerChange', (dp) => changes.push(dp));
    await ads.showBanner();
    expect(ads.getBannerReserveDp()).toBe(50); // real size from bannerAdSizeChanged
    await ads.hideBanner();
    expect(ads.getBannerReserveDp()).toBe(0);
    expect(changes).toContain(50);
  });

  it('recreates the banner after a load failure', async () => {
    const { ads, plugin } = await makeService();
    await ads.showBanner();
    plugin.emit(BannerEvents.FailedToLoad, { code: 3, message: 'no fill' });
    await ads.hideBanner();
    await ads.showBanner();
    expect(plugin.removeBanner).toHaveBeenCalledTimes(1);
    expect(plugin.showBanner).toHaveBeenCalledTimes(2);
  });
});

describe('AdService - interstitial every 3 completed games', () => {
  it('shows an interstitial on games 3, 6, 9 only', async () => {
    const { ads, plugin } = await makeService();
    const shownAt = [];
    for (let game = 1; game <= 9; game++) {
      if (await ads.registerCompletedGame()) shownAt.push(game);
      await vi.waitFor(() => expect(ads.interstitial.ready).toBe(true));
    }
    expect(shownAt).toEqual([3, 6, 9]);
    expect(plugin.showInterstitial).toHaveBeenCalledTimes(3);
    expect(ads.stats.interstitialShows).toBe(3);
    expect(ads.completedGames).toBe(9);
  });

  it('postpones a due interstitial that is not loaded yet to the next game', async () => {
    const { ads, plugin } = await makeService();
    await ads.registerCompletedGame();
    await ads.registerCompletedGame();
    ads.interstitial.ready = false; // still loading at game 3
    expect(await ads.registerCompletedGame()).toBe(false);
    await vi.waitFor(() => expect(ads.interstitial.ready).toBe(true));
    expect(await ads.registerCompletedGame()).toBe(true); // shown at game 4
    expect(plugin.showInterstitial).toHaveBeenCalledTimes(1);
    expect(ads.gamesSinceInterstitial).toBe(0);
  });

  it('resolves even when the interstitial fails to show, and reloads it', async () => {
    const { ads, plugin } = await makeService({ interstitial: 'fail' });
    await ads.registerCompletedGame();
    await ads.registerCompletedGame();
    expect(await ads.registerCompletedGame()).toBe(false);
    expect(ads.isFullscreenShowing).toBe(false);
    await vi.waitFor(() => expect(plugin.prepareInterstitial).toHaveBeenCalledTimes(2));
  });

  it('emits open/close events around full-screen ads (to pause audio)', async () => {
    const { ads } = await makeService();
    const events = [];
    ads.on('fullscreenOpen', (e) => events.push(`open:${e.kind}`));
    ads.on('fullscreenClose', (e) => events.push(`close:${e.kind}`));
    await ads.showInterstitial();
    expect(events).toEqual(['open:interstitial', 'close:interstitial']);
  });

  it('retries loading after a failure', async () => {
    vi.useFakeTimers();
    const plugin = new FakeAdMob({ failPrepare: true });
    const ads = new AdService({ plugin, config: admobConfig, logger: quietLogger });
    await ads.init();
    await vi.advanceTimersByTimeAsync(10);
    expect(plugin.prepareInterstitial).toHaveBeenCalledTimes(1);
    plugin.failPrepare = false;
    await vi.advanceTimersByTimeAsync(admobConfig.retryLoadDelayMs + 10);
    expect(plugin.prepareInterstitial).toHaveBeenCalledTimes(2);
    expect(ads.interstitial.ready).toBe(true);
  });
});

describe('AdService - rewarded "second chance"', () => {
  it('grants the reward when the video is watched to the end', async () => {
    const { ads, plugin } = await makeService({ rewarded: 'reward' });
    const result = await ads.showRewarded();
    expect(result).toEqual({ shown: true, rewarded: true });
    expect(plugin.showRewardVideoAd).toHaveBeenCalledTimes(1);
    expect(ads.stats).toMatchObject({ rewardedShows: 1, rewardsEarned: 1 });
    await vi.waitFor(() => expect(plugin.prepareRewardVideoAd).toHaveBeenCalledTimes(2)); // next one preloaded
  });

  it('does not grant the reward when the user closes the video early', async () => {
    vi.useFakeTimers();
    const { ads } = await makeServiceWithFakeTimers({ rewarded: 'skip' });
    const pending = ads.showRewarded();
    await vi.advanceTimersByTimeAsync(400); // grace period for a late reward callback
    await expect(pending).resolves.toEqual({ shown: true, rewarded: false });
    expect(ads.stats.rewardsEarned).toBe(0);
  });

  it('accepts a reward callback arriving just after the dismiss', async () => {
    vi.useFakeTimers();
    const { ads } = await makeServiceWithFakeTimers({ rewarded: 'late-reward' });
    const pending = ads.showRewarded();
    await vi.advanceTimersByTimeAsync(400);
    await expect(pending).resolves.toEqual({ shown: true, rewarded: true });
  });

  it('handles show failures and a missing ad without hanging', async () => {
    const failing = await makeService({ rewarded: 'fail' });
    await expect(failing.ads.showRewarded()).resolves.toEqual({ shown: false, rewarded: false });

    const rejecting = await makeService({ rewarded: 'reject' });
    await expect(rejecting.ads.showRewarded()).resolves.toEqual({ shown: false, rewarded: false });

    const notReady = await makeService();
    notReady.ads.rewarded.ready = false;
    await expect(notReady.ads.showRewarded()).resolves.toMatchObject({ shown: false, rewarded: false, reason: 'not-ready' });
  });

  it('times out an ad that never reports back', async () => {
    vi.useFakeTimers();
    const { ads } = await makeServiceWithFakeTimers({ rewarded: 'hang' });
    const pending = ads.showRewarded();
    await vi.advanceTimersByTimeAsync(admobConfig.fullscreenTimeoutMs + 10);
    await expect(pending).resolves.toEqual({ shown: false, rewarded: false });
    expect(ads.isFullscreenShowing).toBe(false);
  });

  it('keeps waiting for an ad that is on screen (player left the app mid-video)', async () => {
    vi.useFakeTimers();
    const { ads, plugin } = await makeServiceWithFakeTimers({ rewarded: 'hang' });
    const pending = ads.showRewarded();
    await vi.advanceTimersByTimeAsync(10);
    plugin.emit(RewardEvents.Showed);
    await vi.advanceTimersByTimeAsync(admobConfig.fullscreenTimeoutMs * 3);
    expect(ads.isFullscreenShowing).toBe(true);
    plugin.emit(RewardEvents.Rewarded, { type: 'revive', amount: 1 });
    plugin.emit(RewardEvents.Dismissed);
    await expect(pending).resolves.toEqual({ shown: true, rewarded: true });
  });

  it('refuses a second full-screen ad while one is showing', async () => {
    vi.useFakeTimers();
    const { ads } = await makeServiceWithFakeTimers({ rewarded: 'hang' });
    ads.showRewarded();
    await expect(ads.showInterstitial()).resolves.toBe(false);
    await expect(ads.showRewarded()).resolves.toMatchObject({ reason: 'busy' });
  });

  it('notifies readiness changes for the Continue button', async () => {
    const { ads } = await makeService({ rewarded: 'reward' });
    const states = [];
    ads.on('rewardedChange', (ready) => states.push(ready));
    await ads.showRewarded();
    await vi.waitFor(() => expect(states.at(-1)).toBe(true));
    expect(states[0]).toBe(false);
  });
});

async function makeServiceWithFakeTimers(pluginOptions) {
  const plugin = new FakeAdMob(pluginOptions);
  const ads = new AdService({ plugin, config: admobConfig, logger: quietLogger });
  await ads.init();
  await vi.advanceTimersByTimeAsync(10);
  expect(ads.isRewardedReady()).toBe(true);
  return { ads, plugin };
}
