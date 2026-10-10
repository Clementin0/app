import { dayNumber } from './DailyReward.js';

/**
 * Daily challenge: the same seed and the same twist for everyone on a
 * given day. Beating the first boss pays a reward once per day.
 */
export const CHALLENGE_MODIFIERS = Object.freeze([
  { id: 'speedy', modifiers: { speed: 1.2, score: 1.5 } },
  { id: 'glass', modifiers: { hp: 1, score: 2 } },
  { id: 'laser', modifiers: { weapon: 'laser' } },
  { id: 'meteorStorm', modifiers: { event: 'meteors', score: 1.3 } },
  { id: 'goldFever', modifiers: { event: 'goldRush', score: 1.2 } },
  { id: 'bossHunt', modifiers: { bossAt: 500 } },
  { id: 'ambushes', modifiers: { event: 'ambush', score: 1.3 } },
]);

export const CHALLENGE_REWARD = Object.freeze({ coins: 150, gems: 5 });

export function dailyChallenge(now) {
  const day = dayNumber(now);
  const modifier = CHALLENGE_MODIFIERS[((day % CHALLENGE_MODIFIERS.length) + CHALLENGE_MODIFIERS.length) % CHALLENGE_MODIFIERS.length];
  // Knuth's multiplicative hash: a well spread seed per day.
  const seed = Math.imul(day + 1, 2654435761) >>> 0;
  return { day, seed, modifier };
}
