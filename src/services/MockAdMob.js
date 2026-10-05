import { BannerEvents, ConsentStatus, InterstitialEvents, PrivacyOptionsRequirementStatus, RewardEvents } from './adEvents.js';

/**
 * Browser stand-in for the AdMob plugin, with the same API and events.
 * Used by `npm run dev` and by the verification script, so the complete ad
 * flow (banner area, interstitial every N games, rewarded revive) can be
 * exercised without an Android device. It draws simple DOM placeholders.
 */
export class MockAdMob {
  constructor({ document = globalThis.document, autoClose = false, durations = {}, loadDelayMs = 250 } = {}) {
    this.doc = document ?? null;
    this.autoClose = autoClose;
    this.durations = { interstitial: 2500, rewarded: 5000, ...durations };
    this.loadDelayMs = loadDelayMs;
    this.listeners = new Map();
    this.prepared = { interstitial: false, rewarded: false };
    this.bannerEl = null;
    this.overlayEl = null;
    this.calls = [];
  }

  _log(method, args) {
    this.calls.push({ method, args });
  }

  async addListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
    return { remove: async () => this.listeners.get(name)?.delete(fn) };
  }

  notify(name, data = {}) {
    for (const fn of this.listeners.get(name) ?? []) fn(data);
  }

  _wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async initialize(options) {
    this._log('initialize', options);
  }

  async requestConsentInfo(options) {
    this._log('requestConsentInfo', options);
    return {
      status: ConsentStatus.NOT_REQUIRED,
      isConsentFormAvailable: false,
      canRequestAds: true,
      privacyOptionsRequirementStatus: PrivacyOptionsRequirementStatus.NOT_REQUIRED,
    };
  }

  async showConsentForm() {
    this._log('showConsentForm');
    return this.requestConsentInfo();
  }

  async showPrivacyOptionsForm() {
    this._log('showPrivacyOptionsForm');
  }

  // -------------------------------------------------------------- banner

  async showBanner(options) {
    this._log('showBanner', options);
    if (this.doc && !this.bannerEl) {
      const el = this.doc.createElement('div');
      el.className = 'mock-ad mock-banner';
      el.textContent = 'TEST AD · Banner adattivo AdMob';
      this.doc.body.appendChild(el);
      this.bannerEl = el;
    }
    if (this.bannerEl) this.bannerEl.style.display = 'flex';
    this.notify(BannerEvents.Loaded);
    this.notify(BannerEvents.SizeChanged, { width: 320, height: 50 });
  }

  async hideBanner() {
    this._log('hideBanner');
    if (this.bannerEl) this.bannerEl.style.display = 'none';
    this.notify(BannerEvents.SizeChanged, { width: 0, height: 0 });
  }

  async resumeBanner() {
    this._log('resumeBanner');
    if (this.bannerEl) this.bannerEl.style.display = 'flex';
    this.notify(BannerEvents.SizeChanged, { width: 320, height: 50 });
  }

  async removeBanner() {
    this._log('removeBanner');
    this.bannerEl?.remove();
    this.bannerEl = null;
    this.notify(BannerEvents.SizeChanged, { width: 0, height: 0 });
  }

  // ---------------------------------------------------------- fullscreen

  async prepareInterstitial(options) {
    this._log('prepareInterstitial', options);
    await this._wait(this.loadDelayMs);
    this.prepared.interstitial = true;
    this.notify(InterstitialEvents.Loaded, { adUnitId: options.adId });
    return { adUnitId: options.adId };
  }

  async showInterstitial() {
    this._log('showInterstitial');
    if (!this.prepared.interstitial) throw new Error('Interstitial not prepared');
    this.prepared.interstitial = false;
    this.notify(InterstitialEvents.Showed);
    const close = () => {
      this._closeOverlay();
      this.notify(InterstitialEvents.Dismissed);
    };
    this._openOverlay({
      title: 'INTERSTITIAL DI TEST',
      body: 'Annuncio a schermo intero (ogni 3 partite)',
      closeAfterMs: this.autoClose ? null : 1200,
      onClose: close,
    });
    if (this.autoClose || !this.doc) setTimeout(close, this.durations.interstitial);
  }

  async prepareRewardVideoAd(options) {
    this._log('prepareRewardVideoAd', options);
    await this._wait(this.loadDelayMs);
    this.prepared.rewarded = true;
    this.notify(RewardEvents.Loaded, { adUnitId: options.adId });
    return { adUnitId: options.adId };
  }

  showRewardVideoAd() {
    this._log('showRewardVideoAd');
    if (!this.prepared.rewarded) return Promise.reject(new Error('Rewarded ad not prepared'));
    this.prepared.rewarded = false;
    this.notify(RewardEvents.Showed);

    // Like the native plugin, the promise only settles when the reward is earned.
    return new Promise((resolve) => {
      let earned = false;
      const reward = { type: 'revive', amount: 1 };
      const earn = () => {
        if (earned) return;
        earned = true;
        this.notify(RewardEvents.Rewarded, reward);
        resolve(reward);
        if (this.overlayEl) this.overlayEl.querySelector('.mock-ad-body').textContent = 'Ricompensa ottenuta! Chiudi per continuare.';
      };
      const close = () => {
        this._closeOverlay();
        this.notify(RewardEvents.Dismissed);
      };
      this._openOverlay({
        title: 'VIDEO CON RICOMPENSA DI TEST',
        body: `Guarda il video per continuare (${Math.round(this.durations.rewarded / 1000)}s)`,
        closeAfterMs: this.autoClose ? null : 0,
        onClose: close,
      });
      setTimeout(() => {
        earn();
        if (this.autoClose || !this.doc) setTimeout(close, 50);
      }, this.durations.rewarded);
    });
  }

  _openOverlay({ title, body, closeAfterMs, onClose }) {
    if (!this.doc) return;
    this._closeOverlay();
    const el = this.doc.createElement('div');
    el.className = 'mock-ad mock-fullscreen';
    el.innerHTML = `<div class="mock-ad-title"></div><div class="mock-ad-body"></div><button class="mock-ad-close" type="button" aria-label="Chiudi annuncio">✕</button>`;
    el.querySelector('.mock-ad-title').textContent = title;
    el.querySelector('.mock-ad-body').textContent = body;
    const btn = el.querySelector('.mock-ad-close');
    btn.addEventListener('click', onClose, { once: true });
    if (closeAfterMs === null) btn.style.display = 'none';
    else if (closeAfterMs > 0) {
      btn.style.visibility = 'hidden';
      setTimeout(() => (btn.style.visibility = 'visible'), closeAfterMs);
    }
    this.doc.body.appendChild(el);
    this.overlayEl = el;
  }

  _closeOverlay() {
    this.overlayEl?.remove();
    this.overlayEl = null;
  }
}
