import admobConfig from '../config/admob.config.js';
import { BannerEvents, ConsentStatus, InterstitialEvents, PrivacyOptionsRequirementStatus, RewardEvents } from './adEvents.js';

/**
 * Game-facing wrapper around @capacitor-community/admob.
 *
 * - Banner: shown in Menu and Game Over, hidden during gameplay.
 * - Interstitial: one every `interstitialEveryNGames` completed games.
 * - Rewarded: "second chance" revive, resolved through plugin events because
 *   on Android showRewardVideoAd() only settles when a reward is earned.
 *
 * The plugin is injected (real AdMob on Android, MockAdMob in the browser,
 * a fake in unit tests). Every plugin call is guarded: an ad failure must
 * never break the game loop.
 */
export class AdService {
  constructor({ plugin, config = admobConfig, logger = console, timers } = {}) {
    if (!plugin) throw new Error('AdService: an AdMob plugin implementation is required');
    this.plugin = plugin;
    this.config = config;
    this.log = logger;
    this.timers = timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id),
    };

    this.initialized = false;
    this.initFailed = false;
    this.initPromise = null;
    this.canRequestAds = false;
    this.npa = false;
    this.privacyOptionsRequired = false;

    this.banner = { desired: false, created: false, visible: false, failed: false, heightDp: 0 };
    this._bannerQueue = Promise.resolve();
    this.interstitial = { ready: false, loading: false, retryTimer: null };
    this.rewarded = { ready: false, loading: false, retryTimer: null };
    this._fullscreen = null;

    this.completedGames = 0;
    this.gamesSinceInterstitial = 0;
    this.stats = {
      bannerShows: 0,
      bannerHides: 0,
      interstitialRequests: 0,
      interstitialShows: 0,
      rewardedShows: 0,
      rewardsEarned: 0,
      errors: 0,
    };
    this._handlers = new Map();
  }

  // ------------------------------------------------------------ emitter

  /** Subscribe to: ready, bannerChange, rewardedChange, fullscreenOpen, fullscreenClose. */
  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this._handlers.get(event)?.delete(fn);
  }

  _emit(event, payload) {
    for (const fn of this._handlers.get(event) ?? []) {
      try {
        fn(payload);
      } catch (err) {
        this.log.warn?.('[Ads] listener error', err);
      }
    }
  }

  _error(where, err) {
    this.stats.errors += 1;
    this.log.warn?.(`[Ads] ${where} failed:`, err?.message ?? err);
  }

  // --------------------------------------------------------------- init

  init() {
    this.initPromise ??= this._init();
    return this.initPromise;
  }

  async _init() {
    const c = this.config;
    if (c.warning) this.log.warn?.(`[Ads] ${c.warning}`);
    try {
      await this._registerListeners();
      // Google recommends gathering consent before initializing the SDK.
      if (c.consent?.enabled) await this._gatherConsent();
      else this.canRequestAds = true;

      await this.plugin.initialize({
        initializeForTesting: c.testing,
        testingDevices: c.testingDevices ?? [],
        tagForChildDirectedTreatment: c.tagForChildDirectedTreatment,
        tagForUnderAgeOfConsent: c.tagForUnderAgeOfConsent,
        maxAdContentRating: c.maxAdContentRating,
      });
      this.initialized = true;

      if (this.canRequestAds) {
        this._loadInterstitial();
        this._loadRewarded();
        await this._queueBanner();
      }
      this._emit('ready', { canRequestAds: this.canRequestAds });
      this._emit('bannerChange', this.getBannerReserveDp());
      return true;
    } catch (err) {
      this._error('init', err);
      this.initialized = false;
      this.initFailed = true;
      this._emit('bannerChange', this.getBannerReserveDp());
      return false;
    }
  }

  async _gatherConsent() {
    const c = this.config;
    try {
      const request = { testDeviceIdentifiers: c.testingDevices ?? [], tagForUnderAgeOfConsent: !!c.tagForUnderAgeOfConsent };
      if (c.consent.debugGeography != null) request.debugGeography = c.consent.debugGeography;
      let info = await this.plugin.requestConsentInfo(request);
      if (info?.isConsentFormAvailable && info.status === ConsentStatus.REQUIRED) {
        info = await this.plugin.showConsentForm();
      }
      this.canRequestAds = info?.canRequestAds !== false;
      this.privacyOptionsRequired = info?.privacyOptionsRequirementStatus === PrivacyOptionsRequirementStatus.REQUIRED;
    } catch (err) {
      // Consent servers unreachable: fall back to non-personalized ads.
      this._error('consent', err);
      this.canRequestAds = true;
      this.npa = true;
    }
  }

  async showPrivacyOptions() {
    try {
      await this.plugin.showPrivacyOptionsForm();
      return true;
    } catch (err) {
      this._error('privacy-options', err);
      return false;
    }
  }

  async _registerListeners() {
    const add = async (name, fn) => {
      try {
        await this.plugin.addListener(name, fn);
      } catch (err) {
        this._error(`listener ${name}`, err);
      }
    };
    await Promise.all([
      add(BannerEvents.SizeChanged, (size) => {
        this.banner.heightDp = Math.max(0, Number(size?.height) || 0);
        this._emit('bannerChange', this.getBannerReserveDp());
      }),
      add(BannerEvents.FailedToLoad, (err) => {
        this.banner.failed = true;
        this.banner.heightDp = 0;
        this._error('banner-load', err);
        this._emit('bannerChange', this.getBannerReserveDp());
      }),
      add(BannerEvents.Loaded, () => {
        this.banner.failed = false;
      }),
      add(InterstitialEvents.Showed, () => this._onFullscreenShowed('interstitial')),
      add(RewardEvents.Showed, () => this._onFullscreenShowed('rewarded')),
      add(InterstitialEvents.Dismissed, () => this._finishFullscreen('interstitial', true)),
      add(InterstitialEvents.FailedToShow, (err) => this._finishFullscreen('interstitial', false, err)),
      add(RewardEvents.Rewarded, () => this._markRewarded()),
      add(RewardEvents.Dismissed, () => this._onRewardedDismissed()),
      add(RewardEvents.FailedToShow, (err) => this._finishFullscreen('rewarded', false, err)),
    ]);
  }

  _adOptions(adId) {
    return { adId, isTesting: this.config.testing, npa: this.npa, immersiveMode: true };
  }

  // ------------------------------------------------------------- banner

  showBanner() {
    this.banner.desired = true;
    this._emit('bannerChange', this.getBannerReserveDp());
    return this._queueBanner();
  }

  hideBanner() {
    this.banner.desired = false;
    this._emit('bannerChange', this.getBannerReserveDp());
    return this._queueBanner();
  }

  /** Banner calls are serialized so fast scene changes never race. */
  _queueBanner() {
    this._bannerQueue = this._bannerQueue.then(() => this._syncBanner()).catch((err) => this._error('banner', err));
    return this._bannerQueue;
  }

  async _syncBanner() {
    if (!this.initialized || !this.canRequestAds) return;
    const b = this.banner;
    const c = this.config.banner;
    try {
      if (b.desired && !b.visible) {
        if (b.created && b.failed) {
          await this.plugin.removeBanner();
          b.created = false;
        }
        if (b.created) {
          await this.plugin.resumeBanner();
        } else {
          await this.plugin.showBanner({
            ...this._adOptions(this.config.ids.banner),
            adSize: c.adSize,
            position: c.position,
            margin: c.margin,
          });
          b.created = true;
          b.failed = false;
        }
        b.visible = true;
        this.stats.bannerShows += 1;
      } else if (!b.desired && b.visible) {
        await this.plugin.hideBanner();
        b.visible = false;
        this.stats.bannerHides += 1;
      }
    } catch (err) {
      this._error('banner', err);
    }
    this._emit('bannerChange', this.getBannerReserveDp());
  }

  /** Space (dp ~ CSS px) the UI must keep free at the bottom of the screen. */
  getBannerReserveDp() {
    if (!this.banner.desired || this.initFailed) return 0;
    if (this.initialized && !this.canRequestAds) return 0;
    if (this.banner.visible && this.banner.heightDp > 0) return this.banner.heightDp;
    return this.config.banner.defaultHeightDp;
  }

  // ------------------------------------------------------ loading (full)

  async _loadInterstitial() {
    const s = this.interstitial;
    if (s.ready || s.loading || !this.initialized || !this.canRequestAds) return;
    s.loading = true;
    try {
      await this.plugin.prepareInterstitial(this._adOptions(this.config.ids.interstitial));
      s.ready = true;
    } catch (err) {
      s.ready = false;
      this._error('interstitial-load', err);
      this._scheduleRetry(s, () => this._loadInterstitial());
    } finally {
      s.loading = false;
    }
  }

  async _loadRewarded() {
    const s = this.rewarded;
    if (s.ready || s.loading || !this.initialized || !this.canRequestAds) return;
    s.loading = true;
    try {
      await this.plugin.prepareRewardVideoAd(this._adOptions(this.config.ids.rewarded));
      s.ready = true;
    } catch (err) {
      s.ready = false;
      this._error('rewarded-load', err);
      this._scheduleRetry(s, () => this._loadRewarded());
    } finally {
      s.loading = false;
      this._emit('rewardedChange', this.isRewardedReady());
    }
  }

  _scheduleRetry(slot, fn) {
    if (slot.retryTimer) return;
    slot.retryTimer = this.timers.setTimeout(() => {
      slot.retryTimer = null;
      fn();
    }, this.config.retryLoadDelayMs);
  }

  get isFullscreenShowing() {
    return this._fullscreen !== null;
  }

  _openFullscreen(kind, resolve) {
    const timer = this.timers.setTimeout(() => this._finishFullscreen(kind, false, new Error('timeout')), this.config.fullscreenTimeoutMs);
    this._fullscreen = { kind, resolve, timer, rewarded: false, graceTimer: null };
    this._emit('fullscreenOpen', { kind });
  }

  /** The ad is on screen: from now on only its Dismissed / FailedToShow events end it. */
  _onFullscreenShowed(kind) {
    const f = this._fullscreen;
    if (!f || f.kind !== kind || f.showed) return;
    f.showed = true;
    this.timers.clearTimeout(f.timer);
    f.timer = this.timers.setTimeout(() => this._finishFullscreen(kind, false, new Error('timeout')), this.config.fullscreenShownTimeoutMs ?? this.config.fullscreenTimeoutMs);
  }

  _finishFullscreen(kind, shown, err) {
    const f = this._fullscreen;
    if (!f || f.kind !== kind) return;
    this._fullscreen = null;
    this.timers.clearTimeout(f.timer);
    if (f.graceTimer) this.timers.clearTimeout(f.graceTimer);
    if (err) this._error(`${kind}-show`, err);
    this._emit('fullscreenClose', { kind });

    if (kind === 'interstitial') {
      if (shown) this.stats.interstitialShows += 1;
      this._loadInterstitial();
      f.resolve(shown);
    } else {
      if (shown) this.stats.rewardedShows += 1;
      this._loadRewarded();
      f.resolve({ shown, rewarded: f.rewarded });
    }
  }

  // ------------------------------------------------------- interstitial

  /**
   * Call once per completed game (player leaves the Game Over screen).
   * Shows an interstitial every N games; if none is loaded yet, it stays
   * due and is shown at the next completed game. Resolves after the ad
   * closes (true) or immediately when nothing was shown (false).
   */
  async registerCompletedGame() {
    this.completedGames += 1;
    this.gamesSinceInterstitial += 1;
    if (this.gamesSinceInterstitial < this.config.interstitialEveryNGames) return false;
    if (!this.interstitial.ready) {
      this._loadInterstitial();
      return false;
    }
    const shown = await this.showInterstitial();
    if (shown) this.gamesSinceInterstitial = 0;
    return shown;
  }

  showInterstitial() {
    if (!this.interstitial.ready || this.isFullscreenShowing) return Promise.resolve(false);
    this.interstitial.ready = false;
    this.stats.interstitialRequests += 1;
    return new Promise((resolve) => {
      this._openFullscreen('interstitial', resolve);
      Promise.resolve()
        .then(() => this.plugin.showInterstitial())
        .catch((err) => this._finishFullscreen('interstitial', false, err));
    });
  }

  // ----------------------------------------------------------- rewarded

  isRewardedReady() {
    return this.rewarded.ready && !this.isFullscreenShowing;
  }

  /** Makes sure a rewarded ad is loading (e.g. when the Game Over screen opens). */
  preloadRewarded() {
    this._loadRewarded();
  }

  /** Resolves { shown, rewarded, reason? }. Grant the revive only if rewarded is true. */
  showRewarded() {
    if (this.isFullscreenShowing) return Promise.resolve({ shown: false, rewarded: false, reason: 'busy' });
    if (!this.rewarded.ready) {
      this._loadRewarded();
      return Promise.resolve({ shown: false, rewarded: false, reason: 'not-ready' });
    }
    this.rewarded.ready = false;
    this._emit('rewardedChange', false);
    return new Promise((resolve) => {
      this._openFullscreen('rewarded', resolve);
      Promise.resolve()
        .then(() => this.plugin.showRewardVideoAd())
        .then((item) => {
          if (item) this._markRewarded();
        })
        .catch((err) => this._finishFullscreen('rewarded', false, err));
    });
  }

  _markRewarded() {
    const f = this._fullscreen;
    if (!f || f.kind !== 'rewarded' || f.rewarded) return;
    f.rewarded = true;
    this.stats.rewardsEarned += 1;
    if (f.graceTimer) {
      this.timers.clearTimeout(f.graceTimer);
      this._finishFullscreen('rewarded', true);
    }
  }

  _onRewardedDismissed() {
    const f = this._fullscreen;
    if (!f || f.kind !== 'rewarded') return;
    if (f.rewarded) {
      this._finishFullscreen('rewarded', true);
      return;
    }
    // The reward callback can arrive right after the dismiss: wait briefly.
    f.graceTimer = this.timers.setTimeout(() => {
      f.graceTimer = null;
      this._finishFullscreen('rewarded', true);
    }, 300);
  }
}
