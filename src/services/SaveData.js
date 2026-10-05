import { DEFAULT_SKIN, FREE_COINS, getSkin, SKINS } from '../config/skins.js';

/**
 * Persistent progress stored in LocalStorage (inside the Capacitor WebView
 * this survives app restarts). Falls back to memory when storage is
 * unavailable (private mode, blocked cookies, Node tests).
 */

export const SAVE_KEY = 'neondash.save.v1';

const DEFAULTS = Object.freeze({
  highScore: 0,
  bestDistance: 0,
  totalCoins: 0,
  totalGems: 0,
  gamesPlayed: 0,
  music: true,
  sfx: true,
  vibration: true,
  lang: null, // null = follow the device language
  ownedSkins: [DEFAULT_SKIN],
  selectedSkin: DEFAULT_SKIN,
  lastFreeCoinsAt: 0,
});

function defaultStorage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = '__neondash_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const toCount = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
// JSON copy instead of structuredClone: older Android WebViews lack it.
const clone = (o) => JSON.parse(JSON.stringify(o));
const toBool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

export class SaveData {
  constructor(storage = defaultStorage(), now = () => Date.now()) {
    this.storage = storage;
    this.now = now;
    this.data = clone(DEFAULTS);
    this.load();
  }

  load() {
    if (!this.storage) return this.data;
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      const p = raw ? JSON.parse(raw) : {};
      // v1.0 stored a single "muted" flag.
      const legacySound = typeof p.muted === 'boolean' ? !p.muted : true;
      const owned = Array.isArray(p.ownedSkins) ? p.ownedSkins.filter((id) => getSkin(id).id === id) : [];
      if (!owned.includes(DEFAULT_SKIN)) owned.unshift(DEFAULT_SKIN);
      this.data = {
        highScore: toCount(p.highScore),
        bestDistance: toCount(p.bestDistance),
        totalCoins: toCount(p.totalCoins),
        totalGems: toCount(p.totalGems),
        gamesPlayed: toCount(p.gamesPlayed),
        music: toBool(p.music, legacySound),
        sfx: toBool(p.sfx, legacySound),
        vibration: toBool(p.vibration, true),
        lang: typeof p.lang === 'string' ? p.lang : null,
        ownedSkins: [...new Set(owned)],
        selectedSkin: owned.includes(p.selectedSkin) ? p.selectedSkin : DEFAULT_SKIN,
        lastFreeCoinsAt: toCount(p.lastFreeCoinsAt),
      };
    } catch {
      // Corrupted save: start fresh rather than crash.
      this.data = clone(DEFAULTS);
    }
    return this.data;
  }

  persist() {
    if (!this.storage) return false;
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
      return true;
    } catch {
      return false;
    }
  }

  get highScore() {
    return this.data.highScore;
  }

  get bestDistance() {
    return this.data.bestDistance;
  }

  /** Saves the score if it is a new record. Returns true for a new record. */
  submitScore(score, meters = 0) {
    const s = toCount(score);
    let isRecord = false;
    if (s > this.data.highScore) {
      this.data.highScore = s;
      isRecord = true;
    }
    this.data.bestDistance = Math.max(this.data.bestDistance, toCount(meters));
    this.persist();
    return isRecord;
  }

  addCurrency(coins = 0, gems = 0) {
    this.data.totalCoins += toCount(coins);
    this.data.totalGems += toCount(gems);
    this.persist();
  }

  incrementGamesPlayed() {
    this.data.gamesPlayed += 1;
    this.persist();
    return this.data.gamesPlayed;
  }

  // ------------------------------------------------------------ settings

  setSetting(key, value) {
    if (!['music', 'sfx', 'vibration'].includes(key)) throw new Error(`Unknown setting ${key}`);
    this.data[key] = !!value;
    this.persist();
  }

  setLanguage(lang) {
    this.data.lang = lang;
    this.persist();
  }

  // --------------------------------------------------------------- skins

  ownsSkin(id) {
    return this.data.ownedSkins.includes(id);
  }

  /** Buys a skin. Returns 'bought', 'owned' or 'insufficient'. */
  buySkin(id) {
    const skin = getSkin(id);
    if (skin.id !== id) throw new Error(`Unknown skin ${id}`);
    if (this.ownsSkin(id)) return 'owned';
    const wallet = skin.currency === 'gems' ? 'totalGems' : 'totalCoins';
    if (this.data[wallet] < skin.price) return 'insufficient';
    this.data[wallet] -= skin.price;
    this.data.ownedSkins.push(id);
    this.data.selectedSkin = id;
    this.persist();
    return 'bought';
  }

  /** True when at least one locked skin can be bought right now. */
  canAffordNewSkin() {
    return SKINS.some((s) => !this.ownsSkin(s.id) && this.data[s.currency === 'gems' ? 'totalGems' : 'totalCoins'] >= s.price);
  }

  selectSkin(id) {
    if (!this.ownsSkin(id)) return false;
    this.data.selectedSkin = id;
    this.persist();
    return true;
  }

  // ------------------------------------------- rewarded "free coins"

  /** Milliseconds until the shop's free-coins video can be watched again. */
  freeCoinsCooldownLeft() {
    return Math.max(0, this.data.lastFreeCoinsAt + FREE_COINS.cooldownMs - this.now());
  }

  claimFreeCoins() {
    if (this.freeCoinsCooldownLeft() > 0) return 0;
    this.data.totalCoins += FREE_COINS.amount;
    this.data.lastFreeCoinsAt = this.now();
    this.persist();
    return FREE_COINS.amount;
  }

  snapshot() {
    return clone(this.data);
  }
}
