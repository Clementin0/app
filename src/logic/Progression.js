/**
 * Player level: every run earns XP (distance, kills, bosses, events,
 * perks); each level up pays coins, every 5th level also gems.
 */
export const XP_RULES = Object.freeze({ perMeters: 10, perKill: 2, perBoss: 60, perEvent: 25, perPerk: 10 });

export function xpForRun(stats) {
  const s = stats ?? {};
  const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  return Math.floor(n(s.meters) / XP_RULES.perMeters + n(s.kills) * XP_RULES.perKill + n(s.bosses) * XP_RULES.perBoss + n(s.events) * XP_RULES.perEvent + n(s.perks) * XP_RULES.perPerk);
}

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level) => 120 + 60 * (Math.max(1, level) - 1);

export const levelReward = (level) => ({ coins: 80 + 20 * level, gems: level % 5 === 0 ? 5 : 0 });

/**
 * Adds XP to { level, xp } (xp = progress inside the level). Returns the
 * new state and the levels reached, each with its reward.
 */
export function addXp(state, amount) {
  let level = Math.max(1, Math.floor(state?.level ?? 1));
  let xp = Math.max(0, Math.floor(state?.xp ?? 0)) + Math.max(0, Math.floor(amount));
  const levelsUp = [];
  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    levelsUp.push({ level, reward: levelReward(level) });
  }
  return { level, xp, levelsUp };
}
