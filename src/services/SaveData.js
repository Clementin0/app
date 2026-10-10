import { CATALOG, currencyOf, DEFAULT_EQUIPPED, FREE_COINS, getItem } from '../config/cosmetics.js';
import { getUpgrade, nextCost, UPGRADES } from '../config/upgrades.js';
import { emptyMissionsState } from '../logic3d/Missions.js';
import { addXp } from '../logic/Progression.js';
import { CHALLENGE_REWARD } from './DailyChallenge.js';
import { dailyStatus, dayNumber, emptyDailyState } from './DailyReward.js';

/**
 * Persistent progress stored in LocalStorage (inside the Capacitor WebView
 * this survives app restarts). Falls back to memory when storage is
 * unavailable (private mode, blocked cookies, Node tests). Saves from
 * v1.0 / v1.1 are migrated transparently.
 */

export const SAVE_KEY = 'neondash.save.v1';

const QUALITIES = ['low', 'medium', 'high'];

function defaults() {
  return {
    highScore: 0,
    bestDistance: 0,
    totalCoins: 0,
    totalGems: 0,
    gamesPlayed: 0,
    music: true,
    sfx: true,
    vibration: true,
    lang: null, // null = follow the device language
    quality: 'medium',
    qualityAuto: true, // lowered automatically on slow devices until the player picks a level
    owned: { skin: ['neon'], hat: ['none'], weapon: ['blaster'], trail: ['neon'] },
    equipped: { ...DEFAULT_EQUIPPED },
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
    missions: emptyMissionsState(),
    lifetime: { kills: 0, bosses: 0, runs: 0 },
    lastFreeCoinsAt: 0,
    tutorialDone: false,
    daily: emptyDailyState(),
    level: 1,
    xp: 0,
    challenge: { day: -1, best: 0, done: false },
    bossRushBest: { bosses: 0, score: 0 },
  };
}

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
    this.data = defaults();
    this.load();
  }

  load() {
    if (!this.storage) return this.data;
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      this.data = this._sanitize(raw ? JSON.parse(raw) : {});
    } catch {
      // Corrupted save: start fresh rather than crash.
      this.data = defaults();
    }
    return this.data;
  }

  _sanitize(p) {
    const d = defaults();
    // v1.0 stored a single "muted" flag.
    const legacySound = typeof p.muted === 'boolean' ? !p.muted : true;

    const owned = {};
    const equipped = {};
    for (const cat of Object.keys(CATALOG)) {
      let list = Array.isArray(p.owned?.[cat]) ? p.owned[cat] : [];
      // v1.1 stored skins as ownedSkins / selectedSkin.
      if (cat === 'skin' && Array.isArray(p.ownedSkins)) list = [...list, ...p.ownedSkins];
      list = [...new Set([DEFAULT_EQUIPPED[cat], ...list])].filter((id) => getItem(cat, id));
      owned[cat] = list;
      const want = p.equipped?.[cat] ?? (cat === 'skin' ? p.selectedSkin : undefined);
      equipped[cat] = list.includes(want) ? want : DEFAULT_EQUIPPED[cat];
    }

    const upgrades = {};
    for (const u of UPGRADES) upgrades[u.id] = Math.min(u.costs.length, toCount(p.upgrades?.[u.id]));

    const m = p.missions && Array.isArray(p.missions.active) ? p.missions : emptyMissionsState();
    return {
      ...d,
      highScore: toCount(p.highScore),
      bestDistance: toCount(p.bestDistance),
      totalCoins: toCount(p.totalCoins),
      totalGems: toCount(p.totalGems),
      gamesPlayed: toCount(p.gamesPlayed),
      music: toBool(p.music, legacySound),
      sfx: toBool(p.sfx, legacySound),
      vibration: toBool(p.vibration, true),
      lang: typeof p.lang === 'string' ? p.lang : null,
      quality: QUALITIES.includes(p.quality) ? p.quality : d.quality,
      qualityAuto: toBool(p.qualityAuto, true),
      owned,
      equipped,
      upgrades,
      missions: {
        active: m.active.filter((x) => x && typeof x.id === 'string').map((x) => ({ id: x.id, progress: toCount(x.progress), target: toCount(x.target) || 1, reward: { coins: toCount(x.reward?.coins), gems: toCount(x.reward?.gems) } })),
        completed: toCount(m.completed),
      },
      lifetime: { kills: toCount(p.lifetime?.kills), bosses: toCount(p.lifetime?.bosses), runs: toCount(p.lifetime?.runs) },
      lastFreeCoinsAt: toCount(p.lastFreeCoinsAt),
      // Players of earlier versions already know the controls.
      tutorialDone: toBool(p.tutorialDone, toCount(p.gamesPlayed) > 0),
      daily: { lastDay: Number.isInteger(p.daily?.lastDay) ? p.daily.lastDay : -1, streak: toCount(p.daily?.streak) },
      level: Math.max(1, toCount(p.level)),
      xp: toCount(p.xp),
      challenge: { day: Number.isInteger(p.challenge?.day) ? p.challenge.day : -1, best: toCount(p.challenge?.best), done: p.challenge?.done === true },
      bossRushBest: { bosses: toCount(p.bossRushBest?.bosses), score: toCount(p.bossRushBest?.score) },
    };
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

  addLifetime({ kills = 0, bosses = 0 } = {}) {
    this.data.lifetime.kills += toCount(kills);
    this.data.lifetime.bosses += toCount(bosses);
    this.data.lifetime.runs += 1;
    this.persist();
  }

  // ------------------------------------------------------------ settings

  setSetting(key, value) {
    if (key === 'quality') {
      if (!QUALITIES.includes(value)) throw new Error(`Unknown quality ${value}`);
      this.data.quality = value;
      this.data.qualityAuto = false; // the player's choice wins from now on
    } else if (['music', 'sfx', 'vibration'].includes(key)) {
      this.data[key] = !!value;
    } else {
      throw new Error(`Unknown setting ${key}`);
    }
    this.persist();
  }

  /** Quality picked by the adaptive governor (keeps it in automatic mode). */
  setAutoQuality(value) {
    if (!QUALITIES.includes(value)) throw new Error(`Unknown quality ${value}`);
    this.data.quality = value;
    this.persist();
  }

  // -------------------------------------------------------- daily reward

  dailyStatus() {
    return dailyStatus(this.data.daily, this.now());
  }

  /**
   * Claims today's reward (x `multiplier`, e.g. 2 after a rewarded video).
   * Returns the amount granted, or null if already claimed today.
   */
  claimDaily(multiplier = 1) {
    const status = this.dailyStatus();
    if (!status.available) return null;
    const m = multiplier === 2 ? 2 : 1;
    const granted = { coins: status.reward.coins * m, gems: status.reward.gems * m, day: status.day };
    this.data.daily = { lastDay: dayNumber(this.now()), streak: status.streak };
    this.data.totalCoins += granted.coins;
    this.data.totalGems += granted.gems;
    this.persist();
    return granted;
  }

  // ------------------------------------------------------ player level

  /** Adds XP; level-up rewards go straight to the wallet. */
  addXp(amount) {
    const result = addXp(this.data, amount);
    this.data.level = result.level;
    this.data.xp = result.xp;
    for (const l of result.levelsUp) {
      this.data.totalCoins += l.reward.coins;
      this.data.totalGems += l.reward.gems;
    }
    this.persist();
    return result;
  }

  // ------------------------------------------------- challenge & modes

  challengeStatus() {
    const c = this.data.challenge;
    const today = dayNumber(this.now());
    return c.day === today ? { best: c.best, done: c.done } : { best: 0, done: false };
  }

  /** Records a daily challenge run; returns the reward the first time a boss falls today. */
  submitChallenge({ score = 0, bosses = 0 } = {}) {
    const today = dayNumber(this.now());
    if (this.data.challenge.day !== today) this.data.challenge = { day: today, best: 0, done: false };
    const c = this.data.challenge;
    c.best = Math.max(c.best, toCount(score));
    let reward = null;
    if (!c.done && bosses >= 1) {
      c.done = true;
      reward = { ...CHALLENGE_REWARD };
      this.data.totalCoins += reward.coins;
      this.data.totalGems += reward.gems;
    }
    this.persist();
    return reward;
  }

  /** Boss rush record (bosses first, then score). Returns true for a new record. */
  submitBossRush({ bosses = 0, score = 0 } = {}) {
    const best = this.data.bossRushBest;
    const better = bosses > best.bosses || (bosses === best.bosses && score > best.score);
    if (better) this.data.bossRushBest = { bosses: toCount(bosses), score: toCount(score) };
    this.persist();
    return better;
  }

  completeTutorial() {
    this.data.tutorialDone = true;
    this.persist();
  }

  setLanguage(lang) {
    this.data.lang = lang;
    this.persist();
  }

  // ------------------------------------------------------ shop: cosmetics

  owns(category, id) {
    return this.data.owned[category]?.includes(id) ?? false;
  }

  equippedId(category) {
    return this.data.equipped[category];
  }

  /** Buys an item. Returns 'bought', 'owned' or 'insufficient'. */
  buy(category, id) {
    const item = getItem(category, id);
    if (!item) throw new Error(`Unknown item ${category}/${id}`);
    if (this.owns(category, id)) return 'owned';
    const wallet = currencyOf(item) === 'gems' ? 'totalGems' : 'totalCoins';
    if (this.data[wallet] < item.price) return 'insufficient';
    this.data[wallet] -= item.price;
    this.data.owned[category].push(id);
    this.data.equipped[category] = id;
    this.persist();
    return 'bought';
  }

  equip(category, id) {
    if (!this.owns(category, id)) return false;
    this.data.equipped[category] = id;
    this.persist();
    return true;
  }

  /** True when at least one locked item or upgrade can be bought right now. */
  canAffordSomething() {
    for (const [cat, list] of Object.entries(CATALOG)) {
      for (const item of list) {
        if (this.owns(cat, item.id)) continue;
        const wallet = currencyOf(item) === 'gems' ? this.data.totalGems : this.data.totalCoins;
        if (wallet >= item.price) return true;
      }
    }
    return UPGRADES.some((u) => {
      const c = nextCost(u.id, this.data.upgrades[u.id]);
      return c !== null && this.data.totalCoins >= c;
    });
  }

  // ------------------------------------------------------ shop: upgrades

  upgradeLevel(id) {
    return this.data.upgrades[id] ?? 0;
  }

  /** Buys the next level. Returns 'bought', 'maxed' or 'insufficient'. */
  buyUpgrade(id) {
    if (!getUpgrade(id)) throw new Error(`Unknown upgrade ${id}`);
    const cost = nextCost(id, this.upgradeLevel(id));
    if (cost === null) return 'maxed';
    if (this.data.totalCoins < cost) return 'insufficient';
    this.data.totalCoins -= cost;
    this.data.upgrades[id] = this.upgradeLevel(id) + 1;
    this.persist();
    return 'bought';
  }

  // ------------------------------------------- rewarded "free coins"

  /** Milliseconds until the shop's free-coins video can be watched again. */
  freeCoinsCooldownLeft() {
    // A claim "in the future" (clock moved back) must not lock the video for long.
    const last = Math.min(this.data.lastFreeCoinsAt, this.now());
    return Math.max(0, last + FREE_COINS.cooldownMs - this.now());
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
