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
  muted: false,
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

export class SaveData {
  constructor(storage = defaultStorage()) {
    this.storage = storage;
    this.data = { ...DEFAULTS };
    this.load();
  }

  load() {
    if (!this.storage) return this.data;
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      this.data = {
        highScore: toCount(parsed.highScore),
        bestDistance: toCount(parsed.bestDistance),
        totalCoins: toCount(parsed.totalCoins),
        totalGems: toCount(parsed.totalGems),
        gamesPlayed: toCount(parsed.gamesPlayed),
        muted: parsed.muted === true,
      };
    } catch {
      // Corrupted save: start fresh rather than crash.
      this.data = { ...DEFAULTS };
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

  get muted() {
    return this.data.muted;
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

  setMuted(muted) {
    this.data.muted = !!muted;
    this.persist();
  }

  snapshot() {
    return { ...this.data };
  }
}
