/**
 * Daily login reward: one claim per calendar day (device time zone). Coming
 * back on consecutive days climbs a 7-day ladder, then it starts over;
 * missing a day resets the streak.
 */
export const DAILY_REWARDS = Object.freeze([
  { coins: 50, gems: 0 },
  { coins: 80, gems: 0 },
  { coins: 120, gems: 0 },
  { coins: 0, gems: 2 },
  { coins: 180, gems: 0 },
  { coins: 250, gems: 0 },
  { coins: 100, gems: 5 },
]);

/** Local calendar day number of a timestamp. */
export function dayNumber(ms) {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export function emptyDailyState() {
  return { lastDay: -1, streak: 0 };
}

/**
 * What can be claimed now: { available, day (1-7), reward, streak }.
 * `streak` is the streak the claim would produce.
 */
export function dailyStatus(state, now) {
  const today = dayNumber(now);
  const s = state ?? emptyDailyState();
  if (s.lastDay === today) {
    const day = ((s.streak - 1) % DAILY_REWARDS.length) + 1;
    return { available: false, day, reward: DAILY_REWARDS[day - 1], streak: s.streak };
  }
  const streak = s.lastDay === today - 1 ? s.streak + 1 : 1;
  const day = ((streak - 1) % DAILY_REWARDS.length) + 1;
  return { available: true, day, reward: DAILY_REWARDS[day - 1], streak };
}
